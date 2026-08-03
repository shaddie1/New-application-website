<#
  Prepare crew photos for the website.

  Phone photos arrive at ~4000x3000 and several MB each, and many carry an EXIF
  orientation flag rather than being physically rotated — browsers honour that
  flag inconsistently once an image is re-encoded, so we bake the rotation in
  and strip the metadata.

  Usage:
    powershell -File apps/web/scripts/prepare-photos.ps1 -SourceDir "C:\path\to\photos"

  Each source file is matched by ORDER to the names in $Targets below, so drop
  the six photos into a folder named 1.jpg … 6.jpg (or any names that sort in
  that order).
#>
param(
  [Parameter(Mandatory = $true)][string]$SourceDir,
  [string]$OutDir = "$PSScriptRoot\..\public\photos",
  [int]$MaxEdge = 1600,
  [int]$Quality = 82
)

Add-Type -AssemblyName System.Drawing

$Targets = @(
  'crew-floor-machine',   # branded orange overalls, floor scrubber
  'crew-spray-wand',      # branded overalls, spray/extraction wand
  'crew-upholstery',      # blue hi-vis, cleaning an armchair (wide context shot)
  'crew-at-work',         # crew member working, close
  'gloves-detail',        # gloved hands on upholstery
  'result-armchair'       # the finished, cleaned chair
)

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }

# JPEG encoder with an explicit quality setting; the default is wastefully high.
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int]$Quality)

$files = Get-ChildItem -Path $SourceDir -Include *.jpg,*.jpeg,*.png -Recurse | Sort-Object Name
Write-Output "Found $($files.Count) source image(s) in $SourceDir"

for ($i = 0; $i -lt $files.Count; $i++) {
  $src = $files[$i]
  $name = if ($i -lt $Targets.Count) { $Targets[$i] } else { "photo-$($i + 1)" }
  $img = [System.Drawing.Image]::FromFile($src.FullName)

  # EXIF orientation (tag 0x0112): bake the rotation into the pixels.
  if ($img.PropertyIdList -contains 0x0112) {
    switch ($img.GetPropertyItem(0x0112).Value[0]) {
      3 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
      6 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
      8 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
    }
  }

  $scale = [Math]::Min(1.0, $MaxEdge / [Math]::Max($img.Width, $img.Height))
  $w = [int]([Math]::Round($img.Width * $scale))
  $h = [int]([Math]::Round($img.Height * $scale))

  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($img, 0, 0, $w, $h)
  $g.Dispose()

  $out = Join-Path $OutDir "$name.jpg"
  $bmp.Save($out, $codec, $params)
  $bmp.Dispose(); $img.Dispose()

  $srcMb = [math]::Round($src.Length / 1MB, 2)
  $outKb = [math]::Round((Get-Item $out).Length / 1KB, 0)
  Write-Output ("  {0,-22} {1}x{2}  {3}MB -> {4}KB" -f "$name.jpg", $w, $h, $srcMb, $outKb)
}

Write-Output "Done. Files written to $OutDir"
