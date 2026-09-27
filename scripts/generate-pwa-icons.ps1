param(
  [string]$Source = (Join-Path $PSScriptRoot '..\public\icon-rm-source.png')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$publicDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\public'))
$sourcePath = [System.IO.Path]::GetFullPath($Source)
$sourceImage = [System.Drawing.Bitmap]::new($sourcePath)

try {
  if ($sourceImage.Width -ne $sourceImage.Height) {
    throw "The source icon must be square: $($sourceImage.Width)x$($sourceImage.Height)"
  }

  $sizes = @(
    @{ Name = 'favicon-32.png'; Size = 32; Opaque = $false },
    @{ Name = 'pwa-192.png'; Size = 192; Opaque = $true },
    @{ Name = 'apple-touch-icon.png'; Size = 180; Opaque = $true },
    @{ Name = 'pwa-512.png'; Size = 512; Opaque = $true }
  )

  foreach ($item in $sizes) {
    $size = [int]$item.Size
    $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.Clear([System.Drawing.Color]::Transparent)
        if ($item.Opaque) {
          # iOS and maskable PWA icons need an opaque canvas; never a white halo.
          $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#122F58'))
        }
        $graphics.DrawImage($sourceImage, [System.Drawing.Rectangle]::new(0, 0, $size, $size))
      }
      finally {
        $graphics.Dispose()
      }

      $destination = Join-Path $publicDirectory $item.Name
      $bitmap.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
      Write-Output "$destination ($size x $size)"
    }
    finally {
      $bitmap.Dispose()
    }
  }

  # A conventional ICO covers browsers and Windows shortcuts that do not use
  # the manifest PNG. The PNG payload is supported by current Windows/Chrome.
  $faviconBytes = [System.IO.File]::ReadAllBytes((Join-Path $publicDirectory 'favicon-32.png'))
  $stream = [System.IO.File]::Create((Join-Path $publicDirectory 'favicon.ico'))
  try {
    $writer = [System.IO.BinaryWriter]::new($stream)
    try {
      $writer.Write([uint16]0)
      $writer.Write([uint16]1)
      $writer.Write([uint16]1)
      $writer.Write([byte]32)
      $writer.Write([byte]32)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([uint16]1)
      $writer.Write([uint16]32)
      $writer.Write([uint32]$faviconBytes.Length)
      $writer.Write([uint32]22)
      $writer.Write($faviconBytes)
    }
    finally {
      $writer.Dispose()
    }
  }
  finally {
    $stream.Dispose()
  }
}
finally {
  $sourceImage.Dispose()
}
