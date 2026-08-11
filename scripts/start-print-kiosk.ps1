param([string]$PrinterName = "Canon MG2500 series Printer")

$ErrorActionPreference = "Stop"

$printer = Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue
if (-not $printer) {
  Write-Error "Printer '$PrinterName' was not found. Install the Canon MG2500 series driver and reconnect the USB cable."
  exit 1
}

if ($printer.PortName -notlike "USB*") {
  Write-Error "Printer '$PrinterName' is installed on '$($printer.PortName)', not a USB printer port."
  exit 1
}

if ($printer.PrinterStatus -notin @("Normal", "Idle")) {
  Write-Error "Printer '$PrinterName' is not ready. Windows reports: $($printer.PrinterStatus)."
  exit 1
}

$windowsPrinter = Get-CimInstance Win32_Printer | Where-Object Name -EQ $PrinterName
if (-not $windowsPrinter) {
  Write-Error "Windows could not access the '$PrinterName' print queue."
  exit 1
}

$defaultResult = Invoke-CimMethod -InputObject $windowsPrinter -MethodName SetDefaultPrinter
if ($defaultResult.ReturnValue -ne 0) {
  Write-Error "Windows could not set '$PrinterName' as the default printer (code $($defaultResult.ReturnValue))."
  exit 1
}

Write-Host "Printer ready: $($printer.Name) on $($printer.PortName)"
Write-Host "Starting Firebase print agent. Keep this window open."

$env:PRINT_VENDING_PRINTER = $PrinterName
& npm.cmd run print-agent
