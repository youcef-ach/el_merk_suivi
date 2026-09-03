/**
 * Hardware Device Tier Profiler & Adaptive Quality Engine.
 *
 * Automatically benchmarks the user's GPU, CPU cores, RAM, and touch screen
 * to classify the device into one of 3 performance tiers (Tier 1, Tier 2, Tier 3).
 *
 * Tier 1: Budget Mobile / Weak PC (Locked 60 FPS, 1.0 DPR, Early-Z Linear Depth, 2K Flight Equirect)
 * Tier 2: Mid-Range Phone / Laptop (Balanced, 1.5 DPR, Early-Z Linear Depth, 2K Flight Equirect)
 * Tier 3: Flagship Mobile / Desktop Workstation (Maximum Quality, 2.0 DPR, Log Depth, 4K Master Equirect)
 */

let cachedTierConfig = null;

export function getDeviceTier() {
  if (cachedTierConfig) return cachedTierConfig;

  // Check for developer/user manual override (e.g. ?quality=tier1 or localStorage)
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    const urlOverride = urlParams.get('quality');
    const localOverride = localStorage.getItem('viewer_quality_override');
    const override = urlOverride || localOverride;

    if (override === 'tier1' || override === 'low') {
      cachedTierConfig = buildConfig(1, 'Manual Override: Tier 1 (Low-End)');
      return cachedTierConfig;
    }
    if (override === 'tier2' || override === 'medium') {
      cachedTierConfig = buildConfig(2, 'Manual Override: Tier 2 (Balanced)');
      return cachedTierConfig;
    }
    if (override === 'tier3' || override === 'ultra' || override === 'high') {
      cachedTierConfig = buildConfig(3, 'Manual Override: Tier 3 (Ultra)');
      return cachedTierConfig;
    }
  }

  // 1. Environmental & Hardware Capabilities
  const isMobileOrTouch = typeof window !== 'undefined' && 
    (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || ('ontouchstart' in window) || window.innerWidth < 1024);

  const ramGB = (typeof navigator !== 'undefined' && navigator.deviceMemory) ? navigator.deviceMemory : 4;
  const cpuCores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 4;

  // 2. WebGL Renderer Identification (Request high-performance to wake up discrete NVIDIA/AMD GPU)
  let gpuString = 'Unknown GPU';
  let isDedicatedGpu = false;
  let isBudgetGpu = false;

  try {
    const canvas = document.createElement('canvas');
    // Explicitly request high-performance so dual-GPU laptops (Intel + NVIDIA) report the dedicated GPU
    const gl = canvas.getContext('webgl', { powerPreference: 'high-performance' }) ||
               canvas.getContext('webgl') ||
               canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        gpuString = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
      }
    }
  } catch (_) {}

  const gpuLower = gpuString.toLowerCase();

  // Dedicated Desktop & Flagship GPUs (NVIDIA GeForce GTX/RTX, AMD Radeon, Apple Silicon)
  if (
    /nvidia|geforce|gtx|rtx|quadro|titan|radeon|rx \d|apple m[1-4]|adreno (7[345]0|8\d\d)|mali-g71[05]|mali-g720|immortalis/i.test(gpuLower) ||
    (/apple/i.test(gpuLower) && !isMobileOrTouch)
  ) {
    isDedicatedGpu = true;
  }

  // Budget / Weak Mobile GPUs or software emulators
  if (
    /mali-(4\d\d|g3|g5[12]|t\d\d)|adreno (3\d\d|5\d\d|61[026])|powervr|swiftshader|llvmpipe/i.test(gpuLower) ||
    (isMobileOrTouch && ramGB <= 3) ||
    (isMobileOrTouch && cpuCores <= 4)
  ) {
    isBudgetGpu = true;
  }

  // 3. Reconsidered Classification Algorithm:
  // - Modern Desktop/Laptop PCs have wall power, fast memory buses, and high cooling capacity:
  //   They should ALWAYS receive Tier 3 (Ultra 4K) by default unless it is an extreme potato PC.
  // - Mobile Devices (Smartphones/Tablets) have battery constraints, high-DPI screens, and TBDR GPUs:
  //   They receive Tier 2 (Flagship) or Tier 1 (Budget 60 FPS).
  let tier = 3; // Default for Desktop

  if (!isMobileOrTouch) {
    // Desktop / Laptop:
    if (/swiftshader|llvmpipe/i.test(gpuLower)) {
      // Software emulation -> Tier 1
      tier = 1;
    } else if (ramGB <= 4 || cpuCores <= 2) {
      // Very old/weak legacy PC -> Tier 2
      tier = 2;
    } else {
      // All modern PC workstations, laptops, i5/i7/i9, Ryzen, Apple Macs, GTX/RTX -> Tier 3 Ultra!
      tier = 3;
    }
  } else {
    // Mobile / Tablet:
    if (isDedicatedGpu && ramGB >= 6) {
      // Flagship phone (iPhone Pro / Galaxy Ultra / iPad) -> Tier 2 (Balanced, crisp 1.5 DPR)
      tier = 2;
    } else {
      // Standard / Budget phones (including weak mobile test device) -> Tier 1 (Locked 60 FPS)
      tier = 1;
    }
  }

  cachedTierConfig = buildConfig(tier, `${gpuString} (${isMobileOrTouch ? 'Mobile' : 'Desktop'}, ${ramGB}GB RAM, ${cpuCores} cores)`);
  console.log(`[DeviceTier] Classified as Tier ${tier}: ${cachedTierConfig.label} - Profile:`, cachedTierConfig);
  return cachedTierConfig;
}

function buildConfig(tier, label) {
  const isMobileOrTouch = typeof window !== 'undefined' && 
    (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || ('ontouchstart' in window) || window.innerWidth < 1024);

  if (tier === 1) {
    return {
      tier: 1,
      label: `Tier 1: Budget Performance (${label})`,
      isMobile: isMobileOrTouch,
      maxDpr: 1.0,                       // No high-DPI fill rate choke: locked 60 FPS
      useLogDepth: false,                // Restores mobile hardware Early-Z and Hidden Surface Removal
      cameraNear: 0.15,
      cameraFar: 600,
      flightEquirectTier: '2k',          // 2K Transition Equirect (8 MB VRAM vs 33.5 MB, zero takeoff freeze)
      cubemapLod: '512',                 // Fast loading cubemap LOD
      preferredModel: 'model_lod1.glb',  // 35% decimated geometry for budget mobile
      useDrs: true,                      // Dynamic Resolution Scaling during rapid flight motion
      drsFlightFactor: 0.85,             // Temporarily drop DPR to 0.85 during 1.5s flight
      antialiasing: false
    };
  }

  if (tier === 2) {
    return {
      tier: 2,
      label: `Tier 2: Balanced (${label})`,
      isMobile: isMobileOrTouch,
      maxDpr: 1.5,                       // Crisp on modern phones without overheating
      useLogDepth: false,                // Restores mobile hardware Early-Z
      cameraNear: 0.15,
      cameraFar: 600,
      flightEquirectTier: '2k',          // 2K Transition Equirect for smooth 60 FPS flights
      cubemapLod: '1024',                // Standard crisp 1024 KTX2 cubemap
      preferredModel: 'model.glb',
      useDrs: true,
      drsFlightFactor: 0.8,              // Drop DPR slightly (e.g. 1.5 -> 1.2) during flight
      antialiasing: true
    };
  }

  // Tier 3: Ultra / High-End Workstation
  return {
    tier: 3,
    label: `Tier 3: Ultra Fidelity (${label})`,
    isMobile: isMobileOrTouch,
    maxDpr: 2.0,                         // True Retina / High-DPI
    useLogDepth: true,                   // Logarithmic Depth Buffer for sub-millimeter precision
    cameraNear: 0.15,
    cameraFar: 800,
    flightEquirectTier: '4k',            // Full 4K Master Equirect ($4096 \times 2048$)
    cubemapLod: '1024',
    preferredModel: 'model.glb',
    useDrs: false,                       // Full native resolution at all times
    drsFlightFactor: 1.0,
    antialiasing: true
  };
}
