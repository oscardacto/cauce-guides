param($cliente)
$projectRoot = Split-Path $PSScriptRoot -Parent
$src  = Join-Path $projectRoot "docs\smart-data\data\smart-data-eng-$cliente.xlsx"
$zip  = "$env:TEMP\$cliente.zip"
$tmp  = "$env:TEMP\$cliente-xlsx"

Write-Host "[Smart Data] Fuente de verdad: smart-data-eng-$cliente.xlsx"
Write-Host "[Smart Data] Extrayendo..."

Copy-Item $src $zip -Force
if ($tmp.Length -gt 5 -and (Test-Path $tmp)) { Remove-Item $tmp -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $tmp -Force

$nsR = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
[xml]$wb    = Get-Content "$tmp\xl\workbook.xml"            -Raw -Encoding UTF8
[xml]$wbRel = Get-Content "$tmp\xl\_rels\workbook.xml.rels" -Raw -Encoding UTF8
[xml]$ssXml = Get-Content "$tmp\xl\sharedStrings.xml"       -Raw -Encoding UTF8

$ridToFile = @{}
foreach ($rel in $wbRel.Relationships.Relationship) {
    $ridToFile[$rel.Id] = $rel.Target
}

$strings = @()
foreach ($si in $ssXml.sst.si) {
    if ($si.t)     { $strings += [string]$si.t }
    elseif ($si.r) { $strings += ($si.r | ForEach-Object { [string]$_.t }) -join "" }
    else           { $strings += "" }
}

function Parse-Sheet {
    param($sheetPath, $sheetName)
    [xml]$ws = Get-Content $sheetPath -Raw -Encoding UTF8
    $lines = @()
    $lines += "### $sheetName"
    foreach ($row in $ws.worksheet.sheetData.row) {
        $cells = @()
        foreach ($cell in $row.c) {
            $val = ""
            if ($cell.t -eq "s") {
                $idx = [int]$cell.v
                if ($idx -lt $strings.Count) { $val = $strings[$idx] }
            } elseif ($null -ne $cell.v) {
                $val = [string]$cell.v
            }
            $cells += $val
        }
        $nonEmpty = $cells | Where-Object { $_ -ne "" }
        if ($nonEmpty) {
            $lines += ($cells -join " | ")
        }
    }
    return $lines -join [Environment]::NewLine
}

$results = [System.Collections.Generic.List[string]]::new()
$count = 0
foreach ($sheet in $wb.workbook.sheets.sheet) {
    $name = $sheet.name
    if ($name -like "Gu?a") { continue }
    $rId = $sheet.GetAttribute("id", $nsR)
    if (-not $rId) { $rId = $sheet.id }
    $target = $ridToFile[$rId]
    if (-not $target) { continue }
    $path = Join-Path "$tmp\xl" ($target -replace "/", "\")
    if (-not (Test-Path $path)) { continue }
    $parsed = Parse-Sheet -sheetPath $path -sheetName $name
    $results.Add($parsed)
    Write-Host "  v $name"
    $count++
}
Write-Host "[Smart Data] $count pestanas leidas - listo."
$results -join ([Environment]::NewLine + [Environment]::NewLine)
