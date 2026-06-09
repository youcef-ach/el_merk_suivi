export const TourStore = {
  // Holds references to all GLB child meshes for raycasting occlusion
  modelMeshes: [],
  
  // Expose imperative opacity setters to avoid React re-renders during 60FPS GSAP animations
  setDollhouseOpacity: () => {},
  setSkyboxOpacity: () => {},
};
