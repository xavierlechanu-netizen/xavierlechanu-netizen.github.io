import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
          navigator.serviceWorker.register("sw.js?v=1090000").then(
            (registration) => {
              console.log(
                "ServiceWorker registration successful with scope: ",
                registration.scope,
              );
            },
            (err) => {
              console.log("ServiceWorker registration failed: ", err);
            },
          );
        });
      }