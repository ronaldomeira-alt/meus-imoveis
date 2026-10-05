# ==============================================================================
# SCRIPT DE CRIAÇÃO DA MÁQUINA VIRTUAL HYPER-V PARA AMBIENTE DO CHROME
# ==============================================================================

param(
    [string]$VMName = "Chrome-Bot-Environment",
    [string]$VMPath = "C:\Hyper-V-VMs",
    [long]$VHDSizeGB = 60,
    [long]$MemoryStartupBytes = 4GB,
    [int]$ProcessorCount = 2
)

# 1. Garante a pasta de armazenamento persistente
if (-not (Test-Path $VMPath)) {
    New-Item -ItemType Directory -Path $VMPath -Force | Out-Null
}

$vhdPath = Join-Path $VMPath "$VMName.vhdx"

Write-Host "=========================================================="
Write-Host " CRIANDO MAQUINA VIRTUAL HYPER-V COM DISCO PERSISTENTE"
Write-Host " Nome: $VMName"
Write-Host " Disco: $vhdPath (${VHDSizeGB}GB)"
Write-Host " Memoria: 4GB | Processadores: $ProcessorCount"
Write-Host "=========================================================="

# 2. Busca o comutador virtual de rede (Default Switch)
$switch = Get-VMSwitch -Name "Default Switch" -ErrorAction SilentlyContinue
if (-not $switch) {
    $switch = Get-VMSwitch | Select-Object -First 1
}

# 3. Cria o disco virtual persistente VHDX dinâmico
if (-not (Test-Path $vhdPath)) {
    Write-Host "Criando disco virtual VHDX persistente..."
    New-VHD -Path $vhdPath -SizeBytes ($VHDSizeGB * 1GB) -Dynamic | Out-Null
}

# 4. Cria a Máquina Virtual de Geração 2 (UEFI moderna com suporte TPM / Secure Boot)
$existingVM = Get-VM -Name $VMName -ErrorAction SilentlyContinue
if (-not $existingVM) {
    Write-Host "Registrando Máquina Virtual no Hyper-V..."
    $vmParams = @{
        Name = $VMName
        Generation = 2
        MemoryStartupBytes = $MemoryStartupBytes
        VHDPath = $vhdPath
        Path = $VMPath
    }
    if ($switch) {
        $vmParams["SwitchName"] = $switch.Name
    }
    $vm = New-VM @vmParams
    Set-VMProcessor -VMName $VMName -Count $ProcessorCount
    Set-VMMemory -VMName $VMName -DynamicMemoryEnabled $true -MinimumBytes 2GB -MaximumBytes 8GB
    Write-Host "✅ Máquina Virtual '$VMName' criada com sucesso!"
} else {
    Write-Host "ℹ️ Máquina Virtual '$VMName' já existe no Hyper-V."
}

# 5. Inicia a VM se houver sistema ou mídia conectada
Write-Host "Iniciando a Máquina Virtual..."
Start-VM -Name $VMName -ErrorAction SilentlyContinue
$status = Get-VM -Name $VMName
Write-Host "Status final: $($status.State)"
