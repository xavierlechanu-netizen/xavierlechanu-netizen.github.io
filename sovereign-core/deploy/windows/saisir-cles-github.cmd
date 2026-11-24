@echo off
rem Saisie des secrets de la veille du serveur dans GitHub (fenetre de saisie masquee). Voir saisir-cles-github.ps1.
rem Le script est lu en UTF-8 explicitement : PowerShell 5.1 lirait sinon ses accents de travers.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$s = [IO.File]::ReadAllText('%~dp0saisir-cles-github.ps1', [Text.Encoding]::UTF8); & ([scriptblock]::Create($s))"
