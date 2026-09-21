import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

function escapeHTML(str) {
        if (!str) return "";
        return String(str).replace(/[&<>"']/g, function (match) {
          const escape = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          };
          return escape[match];
        });
      }

      function loadData() {
        const users = JSON.parse(secureGetItem("users") || "[]");
        document.getElementById("user-count").textContent = users.length;
        const ul = document.getElementById("user-list");
        // eslint-disable-next-line no-restricted-syntax
ul.innerHTML = "";
        users.forEach((u) => {
          const safeName = escapeHTML(u.username);
          const safeRole = escapeHTML(u.role);
          ul.innerHTML += `<li>
                    <span><i class="fa-solid fa-user${safeRole === "admin" ? "-tie" : ""}"></i> <strong>${safeName}</strong> <span class="role-badge">${safeRole}</span></span>
                    ${safeRole !== "admin" ? `<button data-action="deleteUser('${safeName}')" class="btn-delete"><i class="fa-solid fa-trash"></i></button>` : ""}
                </li>`;
        });

        const hazards = JSON.parse(secureGetItem("hazards") || "[]");
        document.getElementById("hazard-count").textContent = hazards.length;
        const hl = document.getElementById("hazard-list");
        // eslint-disable-next-line no-restricted-syntax
hl.innerHTML = "";
        hazards.forEach((h, index) => {
          const safeAuthor = escapeHTML(h.author);
          const badgeStr =
            h.type === "police"
              ? "Police"
              : h.type === "accident"
                ? "Accident"
                : "Danger";
          hl.innerHTML += `<li>
                    <span><i class="fa-solid fa-triangle-exclamation" style="color:var(--warning)"></i> <strong>${safeAuthor}</strong> : ${badgeStr}</span>
                    <button data-action="deleteHazard(${index})" class="btn-delete"><i class="fa-solid fa-trash"></i></button>
                </li>`;
        });

        const moods = JSON.parse(secureGetItem("moods") || "[]");
        const ml = document.getElementById("mood-list");
        if (ml) {
          document.getElementById("mood-count").textContent = moods.length;
          // eslint-disable-next-line no-restricted-syntax
ml.innerHTML = "";
          moods.forEach((m, index) => {
            const safeAuthor = escapeHTML(m.author);
            const safeText = escapeHTML(m.text ? m.text : m.label);
            ml.innerHTML += `<li>
                        <span style="font-size:0.9rem;"><strong>${safeAuthor}</strong>: "${safeText}"</span>
                        <button data-action="deleteMood(${index})" class="btn-delete"><i class="fa-solid fa-trash"></i></button>
                    </li>`;
          });
        }

        const suggestions = JSON.parse(secureGetItem("suggestions") || "[]");
        const sl = document.getElementById("suggestion-list");
        if (sl) {
          document.getElementById("suggestion-count").textContent =
            suggestions.length;
          // eslint-disable-next-line no-restricted-syntax
sl.innerHTML = "";
          suggestions.forEach((s, index) => {
            const safeAuthor = escapeHTML(s.author);
            const safeText = escapeHTML(s.text);
            const safeDate = escapeHTML(s.date);
            sl.innerHTML += `<li>
                        <span style="font-size:0.9rem; line-height: 1.4;"><strong>${safeAuthor}</strong> (${safeDate}):<br/><i>"${safeText}"</i></span>
                        <button data-action="deleteSuggestion(${index})" class="btn-delete" title="Archiver / Supprimer"><i class="fa-solid fa-check"></i></button>
                    </li>`;
          });
        }
      }

      function deleteMood(i) {
        const moods = JSON.parse(secureGetItem("moods") || "[]");
        moods.splice(i, 1);
        secureSetItem("moods", JSON.stringify(moods));
        loadData();
      }

      function deleteSuggestion(i) {
        const suggestions = JSON.parse(secureGetItem("suggestions") || "[]");
        suggestions.splice(i, 1);
        secureSetItem("suggestions", JSON.stringify(suggestions));
        loadData();
      }

      function deleteUser(uName) {
        if (
          confirm(
            `ATTENTION : Bannir le compte ${uName} et supprimer instantanément tous ses signalements et anciens messages ?`,
          )
        ) {
          // Delete user
          const users = JSON.parse(secureGetItem("users") || "[]");
          secureSetItem(
            "users",
            JSON.stringify(users.filter((u) => u.username !== uName)),
          );

          // Purge all user's hazards
          const hazards = JSON.parse(secureGetItem("hazards") || "[]");
          secureSetItem(
            "hazards",
            JSON.stringify(hazards.filter((h) => h.author !== uName)),
          );

          // Purge all user's moods
          const moods = JSON.parse(secureGetItem("moods") || "[]");
          secureSetItem(
            "moods",
            JSON.stringify(moods.filter((m) => m.author !== uName)),
          );

          loadData();
          alert(
            `Nettoyage terminé : L'utilisateur ${uName} et tout son passif ont été éradiqués de l'application.`,
          );
        }
      }

      function deleteHazard(i) {
        const hazards = JSON.parse(secureGetItem("hazards"));
        hazards.splice(i, 1);
        secureSetItem("hazards", JSON.stringify(hazards));
        loadData();
      }

      function clearAllHazards() {
        if (confirm("Supprimer tous les signalements mondiaux de la carte ?")) {
          secureSetItem("hazards", "[]");
          loadData();
        }
      }

      window.addEventListener("DOMContentLoaded", loadData);
// --- Action Registry (ESM) ---
registerAction('escapeHTML', escapeHTML);
