# ============================================================================
# Saisie des 5 secrets de la veille du serveur (SMS d'alerte) dans GitHub, depuis Windows.
# Chaque clé est masquée à la frappe, part directement vers GitHub par l'entrée standard de « gh »
# (jamais en argument, jamais dans un fichier) et n'est écrite nulle part sur le PC.
# Lancer par saisir-cles-github.cmd (double-clic). Prérequis : « gh auth status » connecté.
# Les 3 clés viennent de https://eu.api.ovh.com/createToken/ (droit POST /sms/{service}/jobs seulement).
# ============================================================================
$repo = 'xavierlechanu-netizen/xavierlechanu-netizen.github.io'

# Nom du secret → titre, masqué ?, motif accepté (ce qui est refusé est redemandé)
$secrets = [ordered]@{
    OVH_SMS_APP_KEY      = @('Application Key (clé d''application)', $true, '^[A-Za-z0-9]{8,64}$')
    OVH_SMS_APP_SECRET   = @('Application Secret', $true, '^[A-Za-z0-9]{16,64}$')
    OVH_SMS_CONSUMER_KEY = @('Consumer Key', $true, '^[A-Za-z0-9]{16,64}$')
    OVH_SMS_SERVICE      = @('Nom du compte SMS, de la forme sms-xx12345-1', $false, '^sms-[a-z0-9]+-\d+$')
    ALERTE_SMS_NUMERO    = @('Ton numéro de mobile qui recevra l''alerte (06 ou 07)', $false, '^(0|\+33|0033)[67]\d{8}$')
}

function Send-Secret([string]$nom, [string]$valeur) {
    $p = New-Object System.Diagnostics.Process
    $p.StartInfo.FileName = 'gh'
    $p.StartInfo.Arguments = "secret set $nom --repo $repo"
    $p.StartInfo.UseShellExecute = $false
    $p.StartInfo.RedirectStandardInput = $true
    $p.Start() | Out-Null
    $p.StandardInput.Write($valeur) # sans retour à la ligne final
    $p.StandardInput.Close()
    $p.WaitForExit()
    return $p.ExitCode -eq 0
}

Write-Host "Veille du serveur : saisie des 5 valeurs (rien ne s'affiche pour les clés)." -ForegroundColor Cyan
foreach ($nom in $secrets.Keys) {
    $titre, $masque, $motif = $secrets[$nom]
    while ($true) {
        if ($masque) {
            $s = Read-Host $titre -AsSecureString
            $v = [Net.NetworkCredential]::new('', $s).Password
        } else {
            $v = Read-Host $titre
        }
        $v = ($v -replace '[\s​﻿]', '')
        if ($v -match $motif) { break }
        Write-Host "  Valeur refusée (vide, espace en trop ou mauvais format) : recommence." -ForegroundColor Yellow
    }
    if (-not (Send-Secret $nom $v)) { Write-Host "  ERREUR : $nom n'a pas été enregistré (gh connecté ?)." -ForegroundColor Red; Read-Host 'Entrée pour fermer'; exit 1 }
    Write-Host "  $nom enregistré." -ForegroundColor Green
}
Write-Host "Terminé. Tu peux fermer cette fenêtre." -ForegroundColor Cyan
Read-Host 'Entrée pour fermer'
