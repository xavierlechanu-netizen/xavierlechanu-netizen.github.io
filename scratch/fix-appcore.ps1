$filePath = "c:\Users\xavie\.gemini\antigravity-ide\scratch\com.mon50ccetmoi.tws-main\public\js\app-core.js"
$lines = [System.IO.File]::ReadAllLines($filePath, [System.Text.Encoding]::UTF8)

# Show current problematic lines (0-indexed: 2155 to 2163)
Write-Host "=== BEFORE FIX (lines 2155-2163) ==="
for ($i = 2154; $i -le 2163; $i++) {
    Write-Host ("Line " + ($i+1) + ": " + $lines[$i])
}

# Replace the corrupted lines (0-indexed 2154 to 2162 = lines 2155-2163)
$lines[2154] = 'if (!window.watchChannel) {'
$lines[2155] = '  window.watchChannel = new BroadcastChannel("mon50cc_watch_sync");'
$lines[2156] = '  window.watchChannel.onmessage = function(event) {'
$lines[2157] = '    if (event.data.type === "SOS_TRIGGERED" && window.sosActivate) {'
$lines[2158] = '      console.log("SOS triggered from smartwatch!");'
$lines[2159] = '      window.sosActivate();'
$lines[2160] = '    }'
$lines[2161] = '  };'
$lines[2162] = '}'

Write-Host ""
Write-Host "=== AFTER FIX (lines 2155-2163) ==="
for ($i = 2154; $i -le 2163; $i++) {
    Write-Host ("Line " + ($i+1) + ": " + $lines[$i])
}

# Write back without BOM
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($filePath, $lines, $utf8NoBom)
Write-Host ""
Write-Host "File saved successfully."
