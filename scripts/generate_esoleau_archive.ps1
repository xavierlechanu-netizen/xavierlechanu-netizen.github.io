$archiveName = "mon50ccetmoi_esoleau_deposit.zip"
$outputPath = Join-Path $PWD $archiveName

Write-Host "Génération de l'archive eSoleau : $archiveName..."
# Utilise git archive pour ne packager que les fichiers versionnés (ignore node_modules, .env, keystores, etc.)
git archive --format=zip --output=$outputPath HEAD

if (Test-Path $outputPath) {
    $fileSize = (Get-Item $outputPath).length / 1MB
    $hash = Get-FileHash $outputPath -Algorithm SHA256

    Write-Host "Archive générée avec succès : $outputPath"
    Write-Host ("Taille : {0:N2} Mo" -f $fileSize)
    Write-Host "Empreinte SHA-256 : $($hash.Hash)"
    Write-Host ""
    Write-Host "Veuillez conserver cette empreinte précieusement."
} else {
    Write-Error "Échec de la création de l'archive."
}
