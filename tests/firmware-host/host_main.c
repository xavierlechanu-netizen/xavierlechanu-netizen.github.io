/*
 * Scénarios exécutés sur le vrai code du stockage de la boîte noire.
 * Sortie : un objet JSON vérifié ensuite par tests/firmware-signed-event.test.js
 * avec le code du serveur (blackbox-core.js).
 */
#include <stdio.h>
#include <string.h>
#include "blackbox_storage.h"
#include "host_flash.h"
#include "esp_random.h"

#define T0 1730000000u

static uint32_t s_written = 0;

static void put_frame(uint16_t g_x10)
{
    blackbox_frame_t f;
    memset(&f, 0, sizeof(f));
    f.timestamp_utc = T0 + s_written / 10;
    f.timestamp_ms = (uint16_t)((s_written % 10) * 100);
    f.latitude = 488566000 + (int32_t)s_written;
    f.longitude = 23522000;
    f.speed_kmh_x10 = 420;
    f.g_force_x10 = g_x10;
    f.flags = 0x01 | (g_x10 >= 30 ? 0x04 : 0);   /* main.c pose le bit 2 au-delà de 3,0 G */
    if (blackbox_storage_write(&f) != ESP_OK) { fprintf(stderr, "écriture refusée\n"); }
    s_written++;
}

static void hex(const uint8_t *b, size_t n)
{
    putchar('"');
    for (size_t i = 0; i < n; i++) printf("%02x", b[i]);
    putchar('"');
}

static void dump_event(int slot)
{
    blackbox_event_t ev;
    if (slot < 0 || blackbox_event_get((uint8_t)slot, &ev) != ESP_OK) { printf("null"); return; }
    printf("{\"slot\":%d,\"startSeq\":%u,\"endSeq\":%u,\"impactSeq\":%u,\"ack\":%u,\"seed\":", slot,
           ev.start_seq, ev.end_seq, ev.impact_seq, ev.ack);
    hex(ev.seed, 32); printf(",\"root\":"); hex(ev.root, 32);
    printf(",\"sig\":"); hex(ev.sig, ev.sig_len);
    printf(",\"frames\":[");
    int bad = 0;
    for (uint32_t i = 0; i <= ev.end_seq - ev.start_seq; i++) {
        blackbox_frame_t f;
        if (blackbox_event_read_frame((uint8_t)slot, i, &f) != ESP_OK) { bad++; continue; }
        if (i) putchar(',');
        hex((const uint8_t *)&f, sizeof(f));
    }
    printf("],\"unreadable\":%d}", bad);
}

void host_provision(const uint8_t aes[32], const uint8_t priv[32], const uint8_t pub[65]);

/* Clé d'usine : passée en argument (hex) comme si tools/provision_blackbox.py l'avait injectée */
static int unhex(const char *h, uint8_t *out, size_t n)
{
    if (!h || strlen(h) != 2 * n) return -1;
    for (size_t i = 0; i < n; i++) { unsigned v; if (sscanf(h + 2 * i, "%2x", &v) != 1) return -1; out[i] = (uint8_t)v; }
    return 0;
}

int main(int argc, char **argv)
{
    /* argv[1] = clé privée d'usine (64 hex), argv[2] = clé publique (130 hex) ; sans argument : boîtier non provisionné */
    if (argc == 3) {
        uint8_t aes[32], priv[32], pubp[65];
        esp_fill_random(aes, 32);
        if (unhex(argv[1], priv, 32) || unhex(argv[2], pubp, 65)) return 2;
        host_provision(aes, priv, pubp);
    }
    if (blackbox_storage_init() != ESP_OK) return 1;
    uint8_t pub[65] = {0};
    blackbox_storage_get_pubkey(pub);
    printf("{\"provisioned\":%d,\"publicKey\":", argc == 3); hex(pub, 65);

    /* 1. Roulage puis choc à la trame 700 (4,5 G) ; 30 s plus tard l'événement est scellé */
    for (int i = 0; i < 700; i++) put_frame(10);
    put_frame(45);
    int pending_after_shock = blackbox_event_pending();
    for (int i = 0; i < 299; i++) put_frame(10);
    int pending_before_end = blackbox_event_pending();
    put_frame(10);   /* trame 1000 = choc + 300 */
    printf(",\"pendingAfterShock\":%d,\"pendingBeforeEnd\":%d,\"pendingAfterEnd\":%d",
           pending_after_shock, pending_before_end, blackbox_event_pending());
    int first = blackbox_event_oldest_unacked();
    printf(",\"event1\":"); dump_event(first);

    /* 2. Longue suite de trajet : l'anneau fait 3 tours ; l'accident figé ne bouge pas */
    uint32_t target = s_written + 3 * 6678;
    while (s_written < target) put_frame(10);
    uint32_t count = blackbox_storage_count(), unreadable = 0, ring = 0;
    for (uint32_t s = count - (6678 - 42); s < count; s++) {  /* garanti lisible */
        blackbox_frame_t f;
        ring++;
        if (blackbox_storage_read(s, &f) != ESP_OK || f.seq_id != s) unreadable++;
    }
    blackbox_frame_t old;
    int old_err = blackbox_storage_read(0, &old);
    uint32_t max_erase = 0;
    for (uint32_t s = 1; s < HOST_FLASH_SIZE / 4096; s++) if (g_erase_count[s] > max_erase) max_erase = g_erase_count[s];
    printf(",\"ringChecked\":%u,\"ringUnreadable\":%u,\"overwrittenReadRefused\":%d,\"maxSectorErases\":%u,\"framesWritten\":%u",
           ring, unreadable, old_err == ESP_ERR_NOT_FOUND, max_erase, s_written);
    printf(",\"event1AfterRing\":"); dump_event(first);

    /* 3. Redémarrage brutal 37 trames après la dernière synchro de l'en-tête */
    while (blackbox_storage_count() % 50 != 0) put_frame(10);
    for (int i = 0; i < 37; i++) put_frame(10);
    uint8_t before[32], after[32];
    uint32_t count_before = blackbox_storage_count();
    blackbox_storage_get_chain_hash(before);
    if (blackbox_storage_init() != ESP_OK) return 1;   /* RAM perdue, Flash conservée */
    blackbox_storage_get_chain_hash(after);
    printf(",\"rebootCountBefore\":%u,\"rebootCountAfter\":%u,\"rebootHashSame\":%d",
           count_before, blackbox_storage_count(), memcmp(before, after, 32) == 0);

    /* 4. Deuxième choc puis coupure d'alimentation 5 s après : scellé tout de suite */
    for (int i = 0; i < 400; i++) put_frame(10);
    put_frame(80);
    for (int i = 0; i < 50; i++) put_frame(10);
    int sealed_now = blackbox_event_seal_now();
    printf(",\"powerCutSealed\":%d", sealed_now == ESP_OK);
    int second = -1;
    for (int k = 0; k < BLACKBOX_EVENT_SLOTS; k++) if (k != first) second = k;
    printf(",\"event2\":"); dump_event(second);

    /* 5. Troisième choc alors que les deux accidents attendent l'envoi : les anciens sont gardés */
    for (int i = 0; i < 400; i++) put_frame(10);
    put_frame(60);
    for (int i = 0; i < 300; i++) put_frame(10);
    blackbox_event_t e1, e2;
    blackbox_event_get((uint8_t)first, &e1);
    blackbox_event_get((uint8_t)second, &e2);
    printf(",\"thirdKeptOld\":%d", e1.impact_seq == 700 && e2.impact_seq != 0 && e2.impact_seq < e1.impact_seq + 30000);

    /* 6. Acquittement du 1er (preuve reçue par le serveur) puis 4e choc : il prend la place */
    int acked = blackbox_event_ack(e1.end_seq) == ESP_OK;
    blackbox_event_get((uint8_t)first, &e1);
    printf(",\"ackOk\":%d,\"ackByte\":%u,\"oldestUnackedAfterAck\":%d", acked, e1.ack, blackbox_event_oldest_unacked());
    for (int i = 0; i < 400; i++) put_frame(10);
    uint32_t fourth_impact = blackbox_storage_count();
    put_frame(52);
    for (int i = 0; i < 300; i++) put_frame(10);
    blackbox_event_get((uint8_t)first, &e1);
    printf(",\"fourthImpact\":%u,\"slotReusedImpact\":%u", fourth_impact, e1.impact_seq);

    printf(",\"headerSectorErases\":%u,\"totalFrames\":%u,\"flashViolations\":%d}\n",
           g_erase_count[0], blackbox_storage_count(), g_flash_violations);
    return 0;
}
