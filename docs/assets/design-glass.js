// Render the word's nearest exterior once, then composite the blue face by
// depth. Hidden letter walls never stack alpha or create internal glass ribs.
export const FRONT_OPACITY = .86;
export const REVERSE_FACE_OPACITY = .12;
export const GLASS_CAP_OPACITY = .08;
export const GLASS_SIDE_OPACITY = .34;
export const GLASS_FILM_OPACITY = .045;
export const GLASS_FLOW_SECONDS = 14;

// Active-frame time only: pausing/offscreen never catches up in a colour jump.
export function advanceGlassFlow(phase, delta) {
  const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, .05)) : 0;
  return (phase + dt * Math.PI * 2 / GLASS_FLOW_SECONDS) % (Math.PI * 2);
}

export function createDesignGlass(THREE, renderer, geometries, letterPositions) {
  const shellScene = new THREE.Scene(), faceScene = new THREE.Scene(), finalScene = new THREE.Scene();
  const shellGroup = new THREE.Group(), faceGroup = new THREE.Group();
  shellScene.add(shellGroup); faceScene.add(faceGroup);
  const front = new THREE.MeshBasicMaterial({ color: 0x304cde, toneMapped: false,
    side: THREE.DoubleSide, forceSinglePass: true, transparent: true, opacity: FRONT_OPACITY,
    blending: THREE.NoBlending, depthWrite: true, depthTest: true });
  // The back of the blue film is only a faint transmitted tint. Reusing its
  // frontal opacity here would make the otherwise clear rear look painted.
  front.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
      `diffuseColor.a *= gl_FrontFacing ? 1.0 : ${(REVERSE_FACE_OPACITY / FRONT_OPACITY).toFixed(6)};\n#include <opaque_fragment>`);
  };
  front.customProgramCacheKey = () => 'design-blue-film-clear-reverse-v1';
  const hidden = new THREE.MeshBasicMaterial(); hidden.visible = false;
  const glass = new THREE.ShaderMaterial({ toneMapped: false, blending: THREE.NoBlending,
    depthWrite: true, depthTest: true,
    uniforms: { phase: { value: 0 }, flow: { value: 0 }, capOpacity: {value:GLASS_CAP_OPACITY}, sideOpacity: {value:GLASS_SIDE_OPACITY}, filmOpacity: {value:GLASS_FILM_OPACITY}, ice: { value: new THREE.Color(0x84afe8) },
      violet: { value: new THREE.Color(0xa795db) }, lilac: { value: new THREE.Color(0xd1adde) } },
    vertexShader: `varying vec3 worldPosition; varying float capFacing; varying vec3 viewNormal;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        worldPosition = world.xyz;
        capFacing = abs(normal.z);
        viewNormal = normalMatrix * normal;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `uniform float phase; uniform float flow; uniform float capOpacity; uniform float sideOpacity; uniform float filmOpacity;
      uniform vec3 ice; uniform vec3 violet; uniform vec3 lilac;
      varying vec3 worldPosition; varying float capFacing; varying vec3 viewNormal;
      void main() {
        // Both angular response and the slow travelling film loop seamlessly.
        float sweep = 0.5 + 0.5 * sin(worldPosition.x * 0.55 + worldPosition.y * 1.2 + phase + flow);
        float glow = smoothstep(-0.8, 0.9, worldPosition.y + sin(phase + flow) * 0.32);
        vec3 color = mix(mix(ice, violet, sweep), lilac, glow * 0.55);
        float incidence = 1.0 - abs(normalize(viewNormal).z);
        float film = pow(0.5 + 0.5 * sin(worldPosition.x * 0.8 + worldPosition.y * 2.0 + phase * 2.0 - flow + incidence * 0.8), 3.0);
        vec3 surfaceColor = mix(ice, lilac, 0.5 + 0.5 * sin(worldPosition.y * 2.0 - phase + flow));
        color = mix(color, surfaceColor, film * 0.5);
        float grain = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
        gl_FragColor = vec4(color + grain * 0.008, mix(sideOpacity, capOpacity, capFacing) + film * filmOpacity);
      }` });
  const letters = [];
  geometries.forEach((geometry, i) => {
    const shell = new THREE.Mesh(geometry, glass), face = new THREE.Mesh(geometry, [front, hidden]);
    shell.position.x = face.position.x = letterPositions[i];
    shellGroup.add(shell); faceGroup.add(face); letters.push(shell);
  });
  const makeTarget = () => new THREE.WebGLRenderTarget(1, 1, { samples: Math.min(4, renderer.capabilities.maxSamples),
    depthTexture: new THREE.DepthTexture(1, 1), resolveDepthBuffer: true, stencilBuffer: false });
  const shellTarget = makeTarget(), faceTarget = makeTarget();
  const composite = new THREE.ShaderMaterial({ transparent: true, toneMapped: false, depthWrite: false, depthTest: false,
    uniforms: { shellColor: {value:shellTarget.texture}, faceColor: {value:faceTarget.texture},
      shellDepth: {value:shellTarget.depthTexture}, faceDepth: {value:faceTarget.depthTexture} },
    vertexShader: `varying vec2 uvPosition;
      void main() { uvPosition = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `uniform sampler2D shellColor; uniform sampler2D faceColor;
      uniform sampler2D shellDepth; uniform sampler2D faceDepth;
      varying vec2 uvPosition;
      void main() {
        vec4 glass = texture2D(shellColor, uvPosition);
        vec4 face = texture2D(faceColor, uvPosition);
        float glassZ = texture2D(shellDepth, uvPosition).r;
        float faceZ = texture2D(faceDepth, uvPosition).r;
        // A forward-facing cap stays exactly blue, without a clear bevel rim.
        // From behind, one gradient exterior overlays that same blue cap.
        if (face.a > 0.0 && faceZ <= glassZ + 0.00001) glass.a = 0.0;
        float alpha = glass.a + face.a * (1.0 - glass.a);
        vec3 premultiplied = glass.rgb * glass.a + face.rgb * face.a * (1.0 - glass.a);
        gl_FragColor = vec4(premultiplied / max(alpha, 0.00001), alpha);
        #include <colorspace_fragment>
      }` });
  const quad = new THREE.PlaneGeometry(2, 2);
  finalScene.add(new THREE.Mesh(quad, composite));
  const finalCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 2); finalCamera.position.z = 1;
  return { letters,
    get flow() { return glass.uniforms.flow.value; },
    advance(delta) { glass.uniforms.flow.value = advanceGlassFlow(glass.uniforms.flow.value, delta); },
    resize(w, h) {
      const ratio = renderer.getPixelRatio();
      shellTarget.setSize(Math.max(1, Math.floor(w * ratio)), Math.max(1, Math.floor(h * ratio)));
      faceTarget.setSize(shellTarget.width, shellTarget.height);
    },
    paint(camera, position, quaternion) {
      for (const group of [shellGroup, faceGroup]) { group.position.copy(position); group.quaternion.copy(quaternion); }
      // Follow the actual face angle, not an impulse's advanced motor target.
      glass.uniforms.phase.value = 2 * Math.atan2(quaternion.y, quaternion.w);
      renderer.setRenderTarget(shellTarget); renderer.render(shellScene, camera);
      renderer.setRenderTarget(faceTarget); renderer.render(faceScene, camera);
      renderer.setRenderTarget(null); renderer.render(finalScene, finalCamera);
    },
    dispose() { shellTarget.dispose(); faceTarget.dispose(); front.dispose(); hidden.dispose(); glass.dispose(); composite.dispose(); quad.dispose(); }
  };
}
