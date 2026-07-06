import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FixedTimestep } from './FixedTimestep.js';
import { InputState } from './InputState.js';
import { MAPS, getMapById } from '../world/Maps.js';
import { makeBuildHelper } from '../world/MapBuildHelper.js';
import { ColliderStore } from '../world/ColliderStore.js';
import { createPlayer, eyePosition } from '../player/Player.js';
import { tickMovement } from '../player/MovementController.js';
import { MOVEMENT as M } from '../config/Movement.js';
import { WEAPONS } from '../config/Weapons.js';
import { WeaponController } from '../player/WeaponController.js';
import { BulletTracerPool } from '../fx/BulletTracer.js';
import { MuzzleFlashPool } from '../fx/MuzzleFlash.js';
import { HitSparkPool } from '../fx/HitMarker.js';
import { Crosshair } from '../ui/Crosshair.js';
import { Hud } from '../ui/Hud.js';
import { MainMenu } from '../ui/MainMenu.js';
import { Scoreboard } from '../ui/Scoreboard.js';
import { EndScreen } from '../ui/EndScreen.js';
import { CharacterView } from '../player/CharacterView.js';
import { FirstPersonView } from '../player/FirstPersonView.js';
import { EntityStore } from './EntityStore.js';
import { AIController } from '../ai/AIController.js';
import { MATCH } from '../config/Match.js';
import { getRandomSpawn } from '../world/SpawnPoints.js';
import { ANIMAL_IDS, ANIMALS } from '../config/Animals.js';
import { Sfx, resumeAudio } from '../audio/Audio.js';
import { MusicPlayer } from '../audio/MusicPlayer.js';
import { VoicePlayer } from '../audio/VoicePlayer.js';
import { NetClient } from '../net/NetClient.js';
import { setActiveSkin as setWeaponSkin } from '../player/WeaponParts.js';
import { DEFAULT_SKIN } from '../config/WeaponSkins.js';
import { RemoteView } from '../net/RemoteView.js';
import { SettingsPanel } from '../ui/Settings.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { DamageNumbers } from '../fx/DamageNumbers.js';

// Module-level scratch vectors reused across hitscan to avoid per-shot GC churn.
const _shotOrigin = new THREE.Vector3();
const _shotDir = new THREE.Vector3();
const _shotMuzzle = new THREE.Vector3();
const _pelletDir = new THREE.Vector3();
const _shotMuzzle2 = new THREE.Vector3();
const _shotEnd = new THREE.Vector3();
const _shotFar = new THREE.Vector3();

// Build a vertical gradient sky texture from 4 stops [zenith, mid, haze, horizon].
// Falls back to the original Plaza palette if stops are omitted (backward compat).
function makeSkyTexture(stops) {
  const s = stops && stops.length === 4 ? stops
    : ['#5a8fcf', '#9cc4e8', '#d8ecf7', '#f0e8d8'];
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, s[0]);    // zenith
  g.addColorStop(0.5, s[1]);  // mid sky
  g.addColorStop(0.82, s[2]); // haze near horizon
  g.addColorStop(1, s[3]);    // warm horizon glow
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const _rayBox = new THREE.Box3();
const _rayBoxMin = new THREE.Vector3();
const _rayBoxMax = new THREE.Vector3();
const _rayHit = new THREE.Vector3();
const _ray = new THREE.Ray();

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Modern PBR pipeline: ACES filmic tone mapping + sRGB output for correct
    // color, plus PCF soft shadow maps. These give the scene depth & realism
    // instead of the previous flat-shaded, clipped-highlight look.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    // Gradient sky dome replaces the flat blue — a vertical gradient reads as
    // atmosphere without a full skybox shader.
    this.scene.background = makeSkyTexture();
    this.scene.fog = new THREE.FogExp2(0xbfe3f5, 0.006);

    // PMREM environment map: gives metallic PBR materials (weapon skins, metal
    // arena parts) something to reflect. Derived from the sky gradient so the
    // reflected ambient color matches each map's mood. Rebuilt per-map in loadMap.
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this._envTex = null;

    this.camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 500);

    // Lighting — a warm/cool three-point rig with the key light casting shadows.
    this.scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x4a4030, 0.55));
    const dir = new THREE.DirectionalLight(0xfff2d6, 2.2);
    dir.position.set(40, 80, 30);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 200;
    dir.shadow.camera.left = -60;
    dir.shadow.camera.right = 60;
    dir.shadow.camera.top = 60;
    dir.shadow.camera.bottom = -60;
    dir.shadow.bias = -0.0004;
    this.scene.add(dir);
    this.scene.add(dir.target);
    this.sun = dir;
    // Cool fill light from the opposite side to soften the key's hard shadows.
    const fill = new THREE.DirectionalLight(0x88aaff, 0.4);
    fill.position.set(-40, 40, -30);
    this.scene.add(fill);

    // World — map system. The active map owns geometry, spawns, waypoints, palette.
    this.colliders = new ColliderStore();
    this.buildHelper = makeBuildHelper();
    this.arenaGroup = null;            // the THREE.Group returned by map.build (for teardown)
    this.activeMap = MAPS[0];          // default map; MainMenu / rotation can change it
    this.rotationIndex = 0;
    this.rotateMaps = true;
    this.loadMap(this.activeMap);

    // FX pools
    this.tracers = new BulletTracerPool(this.scene);
    this.flashes = new MuzzleFlashPool(this.scene);
    this.sparks = new HitSparkPool(this.scene);

    // Entities + bots
    this.entities = new EntityStore();
    this.bots = [];
    this.pendingShots = [];

    // Local player
    this.player = createPlayer({ id: 'You', isLocal: true, position: new THREE.Vector3(0, 1, 15), animalId: 'FOX' });
    this.player.view = new CharacterView(this.scene);
    this.player.view.setAnimal('FOX');
    this.player.view.setWeapon('AR');
    this.player.view.setVisible(false);
    this.weapon = new WeaponController(WEAPONS.AR);
    this.weapon.fireCallback = () => this.pendingShots.push({});
    this.weapon.onReloadStart = () => this.firstPersonView.startReload(this.weapon.def.reloadTime);
    this.entities.add(this.player);

    // First-person weapon viewmodel (synced to camera each frame, hidden until match)
    this.firstPersonView = new FirstPersonView();
    this.firstPersonView.attach(this.scene);
    this.firstPersonView.setWeapon('AR');

    // Match state (inactive until startMatch)
    this.paused = false;
    this.match = { active: false, timeLeft: MATCH.matchSeconds, fragTarget: MATCH.fragTarget, over: false };
    this.respawnTimers = new Map();

    // UI
    const uiRoot = document.getElementById('ui');
    this.hud = new Hud(uiRoot);
    this.crosshair = new Crosshair(uiRoot);
    this.damageNumbers = new DamageNumbers(uiRoot, this.camera);
    this.vignetteEl = document.getElementById('vignette');
    // Music + voice players (load generated files, fall back to synth if missing)
    this.music = new MusicPlayer();
    this.voice = new VoicePlayer();
    this.music.preload();
    this.voice.preload();
    this._lastFragMilestone = 0;
    this._lowTimeAnnounced = false;
    this.baseFov = this.camera.fov;
    this.scoreboard = new Scoreboard(uiRoot);
    this.scoreboard.attach();
    this.endScreen = new EndScreen(uiRoot, { onPlayAgain: () => this.returnToMenu() });
    this.hud.setWeapon(this.weapon.def.name);
    this.hud.setWeaponIcon(this.weapon.def.id);
    this.killstreak = 0;
    this.hud.setKillstreak(0);
    this.hud.setTime(this.match.timeLeft);

    // Input + main menu
    this.input = new InputState(canvas);
    this.settings = new SettingsPanel(uiRoot, { onChange: (s) => this.applySettings(s) });
    this.menu = new MainMenu(uiRoot, {
      onStart: ({ mode, animal, weapon, skin, map, rotate, address }) => {
        this.rotateMaps = rotate !== false;
        // Apply the chosen weapon skin (purely client-side visual; affects all
        // weapons the player holds). Done before the match starts so the gun is
        // skinned from the first frame.
        setWeaponSkin(skin || DEFAULT_SKIN);
        if (mode === 'connect') {
          this.startMultiplayer(mode, address, animal, weapon, map);
        } else {
          this.startMatch(animal, weapon, map);
        }
      },
      onToggleSettings: () => this.settings.toggle(),
    });
    this.pauseMenu = new PauseMenu(uiRoot, {
      onResume: () => {
        this.pauseMenu.hide();
        this.paused = false;
        this.input.requestPointerLock();
      },
      onToggleSettings: () => this.settings.toggle(),
      onLeave: () => this.returnToMenu(),
    });
    this.applySettings(this.settings.settings);

    // Esc toggles a pause menu during an active match: shows the menu + exits
    // pointer lock; Resume hides it + re-locks the pointer so mouse-look resumes.
    // (The browser natively exits pointer lock on Esc; without this handler the
    // player was stranded with no menu and no way to re-acquire aim.)
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      // If settings is open (from the pause menu), Esc closes settings rather than toggling pause.
      if (this.settings.el.style.display !== 'none') { this.settings.toggle(); return; }
      // Only pause during an active, in-progress match — never on the main menu
      // (where Esc would be meaningless) or the end screen.
      const onMainMenu = this.menu.el.style.display === 'flex' || this.menu.el.style.display === '';
      const onEndScreen = this.endScreen.el.style.display === 'flex';
      if (!this.match.active || this.match.over || onMainMenu || onEndScreen) return;
      this.paused = !this.paused;
      if (this.paused) {
        this.pauseMenu.show();
        if (document.pointerLockElement) document.exitPointerLock();
      } else {
        this.pauseMenu.hide();
        this.input.requestPointerLock();
      }
    });

    // Browsers suppress the Escape keydown while pointer-locked, so we detect
    // "user wants to pause" via the pointer-lock loss that Esc (or tab-switch)
    // triggers. When lock drops mid-match, open the pause menu.
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement) return;            // lock (re-)acquired — nothing to do
      if (this.match.active && !this.match.over && !this.paused) {
        this.paused = true;
        this.pauseMenu.show();
      }
    });

    // Unlock audio + start menu music on the first user gesture (autoplay policy).
    this._audioUnlocked = false;
    const unlock = () => {
      if (this._audioUnlocked) return;
      this._audioUnlocked = true;
      resumeAudio();
      this.music.play('menu');
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    // Post-processing: bloom makes the FX (tracers, muzzle flash, sparks) glow
    // and gives emissive surfaces a hot look. Gated by the quality setting.
    this.bloomEnabled = true;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.6,  // strength
      0.4,  // radius
      0.85  // threshold (only bright/emissive pixels bloom)
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    // Loop
    this.fixed = new FixedTimestep(1 / 60);
    this.running = false;
    this.lastTime = 0;

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    if (this.composer) this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  // Tear down the current arena and build a new one from `map`. Sets the sky/fog
  // palette and rebuilds the collider store. Called on init and on map switch.
  loadMap(map) {
    if (this.arenaGroup) {
      this.scene.remove(this.arenaGroup);
      // dispose geometries/materials to avoid GPU leaks across many matches
      this.arenaGroup.traverse(o => {
        if (o.isMesh) {
          o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
            else o.material.dispose();
          }
        }
      });
    }
    this.colliders.clear();
    this.activeMap = map;
    this.scene.background = makeSkyTexture(map.palette.sky);
    this.scene.fog = new THREE.FogExp2(map.palette.fog, map.palette.fogDensity);
    // Rebuild the environment map from this map's sky so metallic surfaces
    // reflect the right ambient color (fixes dark weapon skins).
    this._applyEnvironment(map.palette.sky);
    this.arenaGroup = map.build(this.scene, this.colliders, this.buildHelper);
  }

  // Build a PMREM cubemap environment from the sky gradient and assign it to
  // scene.environment. Gives MeshStandardMaterial metals (weapons, etc.)
  // image-based lighting to reflect — without this, high-metalness surfaces
  // render nearly black because they have no diffuse albedo to speak of.
  _applyEnvironment(stops) {
    if (!this.pmrem) return;
    const skyTex = makeSkyTexture(stops);
    const env = this.pmrem.fromEquirectangular(skyTex).texture;
    if (this._envTex) this._envTex.dispose();
    this.scene.environment = env;
    this._envTex = env;
  }


  start() {
    this.running = true;
    this.lastTime = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  startMatch(animalId, weaponId, mapId) {
    this.paused = false;
    // Switch map if a different one was selected.
    const map = getMapById(mapId) || this.activeMap;
    if (map.id !== this.activeMap.id) this.loadMap(map);
    // Reset local player
    this.player.loadout.primary = weaponId;
    this.player.animalId = animalId;
    this.applyAnimalStats(this.player, animalId);
    this.player.view.setAnimal(animalId);
    this.player.view.setWeapon(weaponId);
    this.respawnPlayer(this.player);

    this.weapon = new WeaponController(WEAPONS[weaponId]);
    this.weapon.fireCallback = () => this.pendingShots.push({});
    this.weapon.onReloadStart = () => this.firstPersonView.startReload(this.weapon.def.reloadTime);
    this.firstPersonView.setWeapon(weaponId);
    this.firstPersonView.endReload();
    this.hud.setWeapon(this.weapon.def.name);
    this.hud.setWeaponIcon(this.weapon.def.id);
    this.killstreak = 0;
    this.hud.setKillstreak(0);
    this.hud.setReloadProgress(1);

    // Clear old bots, spawn fresh ones.
    for (const bot of this.bots) {
      if (bot.view) bot.view.dispose();
      this.entities.remove(bot);
    }
    this.bots = [];
    const occupied = [this.player.position];
    const diff = MATCH.botDifficulty.normal;
    // Rotating loadouts so bots aren't all identical AR users. Each bot gets a
    // different weapon, cycling through the roster for variety.
    const botWeaponIds = Object.keys(WEAPONS);
    for (let i = 0; i < MATCH.botCount; i++) {
      const sp = getRandomSpawn(occupied, this.activeMap.spawnPoints);
      occupied.push(sp);
      const animal = ANIMAL_IDS[i % ANIMAL_IDS.length];
      const weaponId = botWeaponIds[i % botWeaponIds.length];
      const bot = createPlayer({ id: 'Bot ' + (i + 1), isLocal: false, position: sp, animalId: animal });
      bot.loadout.primary = weaponId;
      bot.score = 0;
      bot.deaths = 0;
      bot.view = new CharacterView(this.scene);
      bot.view.setAnimal(animal);
      bot.view.setWeapon(weaponId);
      bot.weapon = new WeaponController(WEAPONS[weaponId]);
      bot.pendingShots = [];
      bot.weapon.fireCallback = () => bot.pendingShots.push({});
      bot.brain = new AIController(bot, diff, this.activeMap.waypoints);
      this.entities.add(bot);
      this.bots.push(bot);
    }

    // Reset match state
    this.match = { active: true, timeLeft: MATCH.matchSeconds, fragTarget: MATCH.fragTarget, over: false };
    this.respawnTimers.clear();
    this.player.score = 0;
    this.player.deaths = 0;
    this.endScreen.hide();
    resumeAudio();
    this.music.play('combat');
    this.voice.play('matchStart');
    this._lastFragMilestone = 0;
    this._lowTimeAnnounced = false;
    this.input.requestPointerLock();
  }

  // Re-apply an animal's stat block to a player (used when the local player
  // re-picks an animal between matches, since stats are snapshot at create time).
  applyAnimalStats(player, animalId) {
    const animal = ANIMALS[animalId];
    if (!animal) return;
    player.animalId = animalId;
    player.speedMul = animal.speedMul;
    player.jumpMul = animal.jumpMul;
    player.sizeMul = animal.sizeMul;
    player.maxHealth = Math.round(100 * animal.hpMul);
    // full heal to the new maximum whenever the roster changes
    player.health = player.maxHealth;
  }

  applySettings(s) {
    this.input.sensitivity = s.sensitivity;
    this.input.invertY = s.invertY;
    this.baseFov = s.fov;
    this.music.setMuted(!s.musicOn);
    this.voice.setMuted(!s.voiceOn);
    // camera.fov is eased toward baseFov each frame in frame(), so just set baseFov here
    const low = s.quality === 'low';
    if (low) {
      this.renderer.setPixelRatio(1);
    } else {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
    // Visual fidelity tiers: low quality drops shadows + bloom for FPS; high
    // quality keeps both; medium keeps shadows but trims bloom resolution.
    this.renderer.shadowMap.enabled = !low;
    if (this.sun) this.sun.castShadow = !low;
    this.bloomEnabled = s.quality === 'high' && !!this.composer;
    if (this.bloomPass) {
      // medium: weaker/cheaper bloom; high: full strength
      this.bloomPass.strength = low ? 0 : (s.quality === 'high' ? 0.6 : 0.35);
      this.bloomPass.radius = low ? 0 : (s.quality === 'high' ? 0.4 : 0.25);
    }
  }

  // ---- Multiplayer (host / join) ----
  // Additive path: Game keeps its single-player inline sim untouched. In MP the
  // local player uses naive prediction (local movement for responsiveness); remote
  // players + bots render purely from server snapshots via RemoteView interpolation.
  async startMultiplayer(mode, address, animalId, weaponId, mapId) {
    this.paused = false;
    this.mpMode = mode;
    this.mpAnimal = animalId;
    this.mpWeapon = weaponId;
    this.mpMap = mapId;
    // Teardown any existing MP state.
    this.cleanupMultiplayer();

    // Connect-only: every multiplayer client joins the dedicated server by address.
    const url = `ws://${address}`;
    this.netClient = new NetClient();
    this.netClient.onWelcome = (m) => {
      this.mpLocalId = m.you;
      this.menu.setSelectedMap(m.map);
      this.mpMap = m.map;
      this.hud.setWeapon(WEAPONS[weaponId].name);
      this.hud.setWeaponIcon(weaponId);
      this.firstPersonView.setWeapon(weaponId);
      this.mpStartListener = (e) => {
        if (e.key === 'Enter' && this.netClient && !this.match.active) {
          this.netClient.start(this.mpMap);
        }
      };
      window.addEventListener('keydown', this.mpStartListener);
    };
    this.netClient.onMapSelected = (m) => {
      this.mpMap = m.map;
      this.menu.setSelectedMap(m.map);
    };
    this.netClient.onMatchStart = (m) => {
      const map = getMapById(m.map) || this.activeMap;
      if (map.id !== this.activeMap.id) this.loadMap(map);
      this.match = { active: true, timeLeft: m.seconds, fragTarget: m.fragTarget, over: false };
      resumeAudio();
      this.music.play('combat');
      this.firstPersonView.endReload();
      this.player = createPlayer({ id: this.mpLocalId, isLocal: true, position: new THREE.Vector3(0, 1, 15), animalId });
      this.applyAnimalStats(this.player, animalId);
      this.player.view = new CharacterView(this.scene);
      this.player.view.setAnimal(animalId);
      this.player.view.setWeapon(weaponId);
      this.player.view.setVisible(false);
      this.weapon = new WeaponController(WEAPONS[weaponId]);
      // Local shots queue here so fireOneShot can render immediate muzzle/tracer
      // feedback in the MP frame loop (the server still decides damage).
      this.pendingShots = [];
      this.weapon.fireCallback = () => this.pendingShots.push({});
      this.input.requestPointerLock();
      this.remoteView = new RemoteView(this.scene);
      this.mpActive = true;
    };
    this.netClient.onSnapshot = (snap) => {
      // Pure snapshot interpolation: just push to the RemoteView buffer. No
      // reconciliation — the local player's position comes entirely from the
      // interpolated snapshot buffer (see frameMultiplayer). Health/alive/ammo
      // are read from localState each frame.
      if (this.remoteView) this.remoteView.pushSnapshot(snap);
      this.match.timeLeft = snap.timeLeft;
    };
    this.netClient.onMatchEnd = (ranked) => {
      this.pauseMenu.hide();
      this.paused = false;
      this.match.active = false; this.match.over = true;
      if (document.pointerLockElement) document.exitPointerLock();
      this.music.play('menu');
      this.endScreen.show(ranked.map(r => ({ ...r, isLocal: r.id === this.mpLocalId })));
    };
    this.netClient.onKick = (m) => {
      this.hud.addKill('Kicked: ' + (m.reason || ''));
      this.returnToMenu();
    };
    this.netClient.onError = (m) => {
      this.hud.addKill('Server error: ' + (m.msg || m.code || ''));
    };
    this.netClient.onDisconnect = () => {
      this.hud.addKill('Disconnected from server.');
      this.returnToMenu();
    };
    this.menu.hide();
    try {
      await this.netClient.connect(url);
      this.netClient.hello('You', animalId, weaponId);
      this.netClient.selectMap(mapId);
    } catch (e) {
      this.hud.addKill('Could not connect to ' + url);
      this.menu.show();
    }
  }

  cleanupMultiplayer() {
    if (this.mpStartListener) { window.removeEventListener('keydown', this.mpStartListener); this.mpStartListener = null; }
    if (this.remoteView) { this.remoteView.dispose(); this.remoteView = null; }
    if (this.netClient) { this.netClient.close(); this.netClient = null; }
    this.mpActive = false;
  }

  returnToMenu() {
    this.paused = false;
    this.pauseMenu.hide();
    this.match.active = false;
    this.match.over = true;
    this.mpActive = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.music.play('menu');
    // Teardown multiplayer state if active.
    this.cleanupMultiplayer();
    for (const bot of this.bots) {
      if (bot.view) bot.view.dispose();
      this.entities.remove(bot);
    }
    this.bots = [];
    // Advance map rotation so the next match (if rotation is on) lands on the
    // next arena in the roster. The menu reflects the new selection.
    if (this.rotateMaps) {
      this.rotationIndex = (this.rotationIndex + 1) % MAPS.length;
      this.menu.setSelectedMap(MAPS[this.rotationIndex].id);
    }
    this.menu.show();
  }

  endMatch() {
    if (this.match.over) return;
    this.pauseMenu.hide();
    this.paused = false;
    this.match.over = true;
    this.match.active = false;
    if (document.pointerLockElement) document.exitPointerLock();
    const ranked = [...this.entities.players].sort((a, b) => b.score - a.score);
    const youWon = ranked[0] && ranked[0].isLocal;
    this.voice.play(youWon ? 'victory' : 'defeat');
    // The winner's animal speaks its victory line in its own voice.
    if (ranked[0] && ranked[0].animalId) this.voice.playAnimal(ranked[0].animalId, 'victory');
    this.music.play('menu');
    this.endScreen.show(ranked);
  }

  respawnPlayer(player) {
    const others = this.entities.alive().filter(p => p !== player).map(p => p.position);
    const sp = getRandomSpawn(others, this.activeMap.spawnPoints);
    player.position.copy(sp);
    player.velocity.set(0, 0, 0);
    player.health = player.maxHealth;
    player.alive = true;
    player.yaw = 0;
    player.pitch = 0;
    if (player.weapon) {
      player.weapon.ammo = player.weapon.def.mag;
      player.weapon.reloading = false;
      player.weapon.nextFireTime = 0;
    } else if (player === this.player) {
      // local player's current weapon lives on `this.weapon`, not player.weapon
      this.weapon.ammo = this.weapon.def.mag;
      this.weapon.reloading = false;
      this.weapon.nextFireTime = 0;
    }
    if (player.view) player.view.setVisible(!player.isLocal); // local view stays hidden (first person)
    // Per-animal spawn voice: the respawning player speaks in their own voice.
    this.voice.playAnimal(player.animalId, 'spawn');
  }

  frameMultiplayer(realDt) {
    if (this.paused) return;
    if (!this.netClient || !this.remoteView) return;

    // --- Look (instant — applied directly to camera, never waits for server) ---
    if (this.match.active) {
      const look = this.input.consumeLook();
      this.player.yaw -= look.dx;
      this.player.pitch -= look.dy;
      this.player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.player.pitch));
    }
    const intent = this.input.buildIntent();
    const firing = this.match.active && intent.firing;
    const reloadReq = this.input.consumeReloadRequest();

    // --- Send inputs to server (the server owns the authoritative position) ---
    if (this.match.active) {
      this.netClient.sendInput({
        forward: intent.forward, strafe: intent.strafe,
        jump: intent.jump, sprint: intent.sprint,
        crouch: intent.crouch, firing: intent.firing,
        reloadRequested: reloadReq,
        yaw: this.player.yaw, pitch: this.player.pitch,
      });
    }

    // --- Tick the local weapon locally for instant fire/reload feedback ---
    // (The server enforces fire-rate authoritatively; this is just for viewmodel
    // animation + the immediate muzzle/tracer/sfx the player sees on click.)
    this.weapon.update(realDt, firing, reloadReq);
    for (const _shot of this.pendingShots) this.fireOneShotLocalFx(this.player, this.weapon);
    this.pendingShots.length = 0;

    // --- Interpolate ALL players (including local) from server snapshots ---
    // No local prediction: the local player's position comes purely from the
    // interpolated snapshot buffer (same as remote players). This eliminates all
    // drift/rubber-band/loop bugs — the client never runs movement.
    this.remoteView.update(this.mpLocalId, realDt);
    const ls = this.remoteView.localState;

    // --- Process server events (tracers, damage FX, killfeed) ---
    for (const ev of this.remoteView.drainEvents()) {
      if (ev.k === 'shot') {
        if (ev.shooter === this.mpLocalId) continue; // local FX already spawned
        this.tracers.spawn(new THREE.Vector3(ev.ox, ev.oy, ev.oz), new THREE.Vector3(ev.dx, ev.dy, ev.dz));
        this.flashes.spawn(new THREE.Vector3(ev.ox + ev.dx * 0.6, ev.oy + ev.dy * 0.6, ev.oz + ev.dz * 0.6));
      } else if (ev.k === 'hit') {
        const snapPlayers = this.remoteView.snapshots.at(-1)?.players || [];
        const victim = snapPlayers.find(p => p.id === ev.victim);
        if (victim) {
          const point = new THREE.Vector3(victim.x, victim.y + 1.0, victim.z);
          this.damageNumbers.spawn(point, ev.dmg, ev.hs);
          this.sparks.spawn(point, new THREE.Vector3(0, 1, 0), ev.hs ? 0xffaa22 : 0xff3344);
        }
        if (ev.shooter === this.mpLocalId) { this.hud.showHitmarker(false); Sfx.hit(); }
        if (ev.victim === this.mpLocalId) Sfx.hurt();
      } else if (ev.k === 'kill') {
        const s = (this.remoteView.snapshots.at(-1)?.players || []).find(p => p.id === ev.shooter);
        const v = (this.remoteView.snapshots.at(-1)?.players || []).find(p => p.id === ev.victim);
        this.hud.addKill(`${s ? s.name : '?'} ${ev.hs ? 'headshotted' : 'fragged'} ${v ? v.name : '?'}`);
        if (ev.shooter === this.mpLocalId) Sfx.kill();
      }
    }

    // --- Render: camera follows the interpolated local position ---
    this.tracers.update(realDt);
    this.flashes.update(realDt);
    this.sparks.update(realDt);
    this.damageNumbers.update(realDt);
    // Camera position = interpolated server position + eye height.
    this.camera.position.set(ls.x, ls.y + M.EYE_HEIGHT, ls.z);
    // Camera rotation = local mouse-look (instant, NOT from snapshots).
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.player.yaw;
    this.camera.rotation.x = this.player.pitch;
    this.camera.updateMatrixWorld();
    if (this.sun) {
      this.sun.position.set(ls.x + 40, 80, ls.z + 30);
      this.sun.target.position.set(ls.x, ls.y, ls.z);
      this.sun.target.updateMatrixWorld();
    }
    const showFP = this.match.active && ls.alive;
    this.firstPersonView.setVisible(showFP);
    if (showFP) {
      this.firstPersonView.syncToCamera(this.camera);
      this.firstPersonView.update(realDt, Math.hypot(ls.vx, ls.vz));
    }
    if (this.bloomEnabled && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);

    // --- HUD (driven by interpolated/server-authoritative state) ---
    this.hud.setHealth(ls.hp);
    this.hud.setAmmo(this.weapon.ammo, this.weapon.def.mag);
    this.hud.setReloadProgress(this.weapon.reloading ? this.weapon.reloadProgress : 1);
    this.hud.setTime(Math.ceil(this.match.timeLeft));
    const speed = Math.hypot(ls.vx, ls.vz);
    this.crosshair.setSpread(14 + speed * 2);
    const targetFov = this.baseFov + (intent.sprint && speed > 2 ? 8 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, realDt * 10);
      this.camera.updateProjectionMatrix();
    }
    if (this.vignetteEl) {
      const intensity = ls.alive && ls.hp < 30 ? (30 - ls.hp) / 30 : 0;
      this.vignetteEl.style.boxShadow = `inset 0 0 200px 60px rgba(180,0,0,${(intensity * 0.6).toFixed(3)})`;
    }
    this.scoreboard.update(this.remoteView ? (this.remoteView.snapshots.at(-1)?.players || []).map(p => ({ id: p.id, name: p.name, animalId: p.animal, score: p.score, deaths: 0, isLocal: p.id === this.mpLocalId, alive: p.alive })) : []);
  }

  frame(realDt) {
    if (this.paused) return;
    // Multiplayer path: send input + render from server snapshots. Keeps the
    // single-player inline sim path below fully untouched.
    if (this.mpActive) { this.frameMultiplayer(realDt); return; }
    // Look (local player only, only while match active)
    if (this.match.active) {
      const look = this.input.consumeLook();
      this.player.yaw -= look.dx;
      this.player.pitch -= look.dy;
      this.player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.player.pitch));
    }
    this.player.intent = this.input.buildIntent();

    // Sim
    this.fixed.update(realDt, (dt) => {
      if (this.match.active) {
        // Match timer
        this.match.timeLeft -= dt;
        if (this.match.timeLeft <= 30 && !this._lowTimeAnnounced) {
          this._lowTimeAnnounced = true;
          this.voice.play('lowTime');
        }
        if (this.match.timeLeft <= 0) {
          this.match.timeLeft = 0;
          this.endMatch();
        }
        // Respawns
        for (const id of [...this.respawnTimers.keys()]) {
          const left = this.respawnTimers.get(id) - dt;
          if (left <= 0) {
            this.respawnTimers.delete(id);
            const p = this.entities.players.find(p => p.id === id);
            if (p) this.respawnPlayer(p);
          } else {
            this.respawnTimers.set(id, left);
          }
        }
      }

      if (this.match.active && this.player.alive) tickMovement(this.player, dt, this.colliders);
      const firing = this.match.active && this.player.alive && this.player.intent.firing;
      const reloadReq = this.input.consumeReloadRequest();
      this.weapon.update(dt, firing, reloadReq);

      for (const bot of this.bots) {
        if (!bot.alive) continue;
        bot.brain.update(dt, this.entities.enemiesOf(bot), this.colliders);
        tickMovement(bot, dt, this.colliders);
        bot.weapon.update(dt, bot.intent.firing, bot.intent.reloadRequested);
        // Occasional per-animal taunt for ambience (jittered cooldown ~10-18s).
        bot._tauntTimer = (bot._tauntTimer != null ? bot._tauntTimer : 8 + Math.random() * 8) - dt;
        if (bot._tauntTimer <= 0) {
          bot._tauntTimer = 10 + Math.random() * 8;
          this.voice.playAnimal(bot.animalId, 'taunt');
        }
      }
    });

    // Resolve pending shots (only while match active)
    if (this.match.active) {
      for (const _shot of this.pendingShots) this.fireOneShot(this.player, this.weapon);
      this.pendingShots.length = 0;
      for (const bot of this.bots) {
        for (const _shot of bot.pendingShots) this.fireOneShot(bot, bot.weapon);
        bot.pendingShots.length = 0;
      }
    } else {
      this.pendingShots.length = 0;
      for (const bot of this.bots) bot.pendingShots.length = 0;
    }

    // FX
    this.tracers.update(realDt);
    this.flashes.update(realDt);
    this.sparks.update(realDt);
    this.damageNumbers.update(realDt);

    // Bot views
    for (const bot of this.bots) {
      if (bot.view) {
        bot.view.setPosition(bot.position.x, bot.position.y, bot.position.z);
        const speed = Math.hypot(bot.velocity.x, bot.velocity.z);
        bot.view.update(realDt, speed, bot.yaw, bot.pitch);
      }
    }

    // Camera
    const eye = eyePosition(this.player);
    this.camera.position.copy(eye);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.player.yaw;
    this.camera.rotation.x = this.player.pitch;
    this.camera.updateMatrixWorld();
    // Keep the sun's shadow frustum centered on the player so shadows stay
    // crisp wherever you roam on the large map.
    if (this.sun) {
      this.sun.position.set(eye.x + 40, 80, eye.z + 30);
      this.sun.target.position.set(eye.x, eye.y, eye.z);
      this.sun.target.updateMatrixWorld();
    }
    // First-person viewmodel: visible only while playing + alive
    const showFP = this.match.active && this.player.alive;
    this.firstPersonView.setVisible(showFP);
    if (showFP) {
      this.firstPersonView.syncToCamera(this.camera);
      this.firstPersonView.update(realDt, Math.hypot(this.player.velocity.x, this.player.velocity.z));
    }
    // Render through the composer (bloom + output) when enabled, else direct.
    if (this.bloomEnabled && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // HUD + scoreboard
    this.hud.setHealth(this.player.health);
    this.hud.setAmmo(this.weapon.ammo, this.weapon.def.mag);
    this.hud.setTime(this.match.timeLeft);
    this.hud.setReloadProgress(this.weapon.reloading ? this.weapon.reloadProgress : 1);
    const speed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    this.crosshair.setSpread(14 + speed * 2);
    // Sprint FOV kick: widen FOV when sprinting/fast, ease back otherwise
    const targetFov = this.baseFov + (this.player.intent.sprint && this.player.velocity.lengthSq() > 4 ? 8 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, realDt * 10);
      this.camera.updateProjectionMatrix();
    }
    // Low-HP vignette: intensify red inset when health is low
    if (this.vignetteEl) {
      const intensity = this.player.alive && this.player.health < 30 ? (30 - this.player.health) / 30 : 0;
      this.vignetteEl.style.boxShadow = `inset 0 0 200px 60px rgba(180,0,0,${(intensity * 0.6).toFixed(3)})`;
    }
    this.scoreboard.update(this.entities.players);
  }

  fireOneShot(shooter, weapon) {
    const def = weapon.def;
    // Origin/aim: local player uses the real gun-muzzle world position; bots use eye-derived.
    let origin, baseDir;
    if (shooter.isLocal && this.firstPersonView.group.visible) {
      const m = this.firstPersonView.getMuzzleWorldPosition(_shotOrigin, _shotDir);
      origin = _shotOrigin.copy(m.pos);
      baseDir = _shotDir.copy(m.dir);
      this.firstPersonView.triggerKick(1);
    } else {
      origin = _shotOrigin.set(shooter.position.x, shooter.position.y + M.EYE_HEIGHT, shooter.position.z);
      baseDir = _shotDir.set(
        -Math.sin(shooter.yaw) * Math.cos(shooter.pitch),
         Math.sin(shooter.pitch),
        -Math.cos(shooter.yaw) * Math.cos(shooter.pitch)
      );
    }

    // Per-shot FX (once): muzzle flash + weapon sound, at the muzzle.
    _shotMuzzle.copy(origin).addScaledVector(baseDir, 0.6);
    this.flashes.spawn(_shotMuzzle);
    this.playShootSfx(def.id);

    // Effective spread = base weapon spread + a penalty that scales with the
    // shooter's horizontal speed (running) and a flat bonus while airborne.
    // This rewards stopping to shoot and punishes jump-shooting, giving each
    // weapon a distinct "feel" for accuracy on the move.
    const hSpeed = Math.hypot(shooter.velocity.x, shooter.velocity.z);
    const airborne = !shooter.onGround;
    let spread = def.spread;
    if (def.moveSpreadPenalty) {
      spread += hSpeed * def.moveSpreadPenalty;
      if (airborne) spread += def.moveSpreadPenalty * 8; // big inaccuracy while jumping
    }

    // Fire N pellets (shotgun) or 1 (everything else). Each pellet gets its own spread + ray.
    const pellets = def.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      // scratch per-pellet direction (don't clobber baseDir for the next pellet)
      _pelletDir.copy(baseDir);
      _pelletDir.x += (Math.random() - 0.5) * spread;
      _pelletDir.y += (Math.random() - 0.5) * spread;
      _pelletDir.z += (Math.random() - 0.5) * spread;
      _pelletDir.normalize();
      this.fireOnePellet(shooter, def, origin, _pelletDir);
    }

    // Recoil (local player only)
    if (shooter.isLocal) {
      shooter.pitch += def.recoil.vertical * (Math.random() * 0.5 + 0.5);
      shooter.yaw += (Math.random() - 0.5) * def.recoil.horizontal;
      shooter.pitch = Math.min(shooter.pitch, Math.PI / 2 - 0.01);
    }
  }

  // Multiplayer local-fire feedback: identical FX to fireOneShot (muzzle flash,
  // shot sound, viewmodel kick, recoil, tracer to the wall impact, impact spark)
  // but applies NO damage — the server is authoritative and will send its own
  // hit/kill events via the snapshot. This exists so pulling the trigger feels
  // instant instead of waiting a full network round trip for the first feedback.
  // (We only fire it for the local player, so no shooter/bot branch is needed.)
  fireOneShotLocalFx(shooter, weapon) {
    const def = weapon.def;
    let origin, baseDir;
    if (this.firstPersonView.group.visible) {
      const m = this.firstPersonView.getMuzzleWorldPosition(_shotOrigin, _shotDir);
      origin = _shotOrigin.copy(m.pos);
      baseDir = _shotDir.copy(m.dir);
      this.firstPersonView.triggerKick(1);
    } else {
      origin = _shotOrigin.set(shooter.position.x, shooter.position.y + M.EYE_HEIGHT, shooter.position.z);
      baseDir = _shotDir.set(
        -Math.sin(shooter.yaw) * Math.cos(shooter.pitch),
         Math.sin(shooter.pitch),
        -Math.cos(shooter.yaw) * Math.cos(shooter.pitch)
      );
    }
    _shotMuzzle.copy(origin).addScaledVector(baseDir, 0.6);
    this.flashes.spawn(_shotMuzzle);
    this.playShootSfx(def.id);

    const hSpeed = Math.hypot(shooter.velocity.x, shooter.velocity.z);
    let spread = def.spread;
    if (def.moveSpreadPenalty) { spread += hSpeed * def.moveSpreadPenalty; if (!shooter.onGround) spread += def.moveSpreadPenalty * 8; }
    const pellets = def.pellets || 1;
    const MAX = 500;
    for (let p = 0; p < pellets; p++) {
      _pelletDir.copy(baseDir);
      _pelletDir.x += (Math.random() - 0.5) * spread;
      _pelletDir.y += (Math.random() - 0.5) * spread;
      _pelletDir.z += (Math.random() - 0.5) * spread;
      _pelletDir.normalize();
      // Trace only to the wall for the tracer endpoint + impact spark. Remote
      // players are interpolated and the server decides hits, so we don't test
      // against them here (avoids misleading local hitmarkers on lag).
      const wallHit = this.colliders.raycast(origin, _pelletDir, MAX);
      const endPoint = wallHit ? wallHit.point : _shotEnd.copy(origin).addScaledVector(_pelletDir, MAX);
      _shotMuzzle2.copy(origin).addScaledVector(_pelletDir, 0.6);
      this.tracers.spawn(_shotMuzzle2, endPoint);
      if (wallHit) this.sparks.spawn(wallHit.point, new THREE.Vector3(0, 1, 0), 0xffaa22);
    }
    // Recoil (local player only — same as fireOneShot).
    shooter.pitch += def.recoil.vertical * (Math.random() * 0.5 + 0.5);
    shooter.yaw += (Math.random() - 0.5) * def.recoil.horizontal;
    shooter.pitch = Math.min(shooter.pitch, Math.PI / 2 - 0.01);
  }

  playShootSfx(weaponId) {
    switch (weaponId) {
      case 'SNIPER': Sfx.shootSniper(); break;
      case 'SHOTGUN': Sfx.shootShotgun(); break;
      case 'PISTOL': Sfx.shootPistol(); break;
      case 'SMG': Sfx.shootSMG(); break;
      default: Sfx.shootAR();
    }
  }

  // Resolve a single pellet ray: nearest of {players, walls}, apply damage/FX.
  fireOnePellet(shooter, def, origin, dir) {
    const MAX = 500;
    let best = null;
    for (const other of this.entities.players) {
      if (other === shooter || !other.alive) continue;
      const hit = playerRayHit(other, origin, dir, MAX);
      if (hit && (!best || hit.dist < best.dist)) best = { dist: hit.dist, point: hit.point, target: other, head: hit.head };
    }
    const wallHit = this.colliders.raycast(origin, dir, MAX);
    if (wallHit && (!best || wallHit.dist < best.dist)) {
      best = { dist: wallHit.dist, point: wallHit.point, target: null, head: false };
    }
    _shotMuzzle2.copy(origin).addScaledVector(dir, 0.6);

    if (best) {
      this.tracers.spawn(_shotMuzzle2, best.point);
      if (best.target) {
        let dmg = applyFalloff(def.damage, best.dist, def.falloffStart, def.falloffEnd);
        const headshot = best.head && def.headshotMul && def.headshotMul > 1;
        if (headshot) dmg *= def.headshotMul;
        best.target.health -= dmg;
        // red sparks for body, bright orange for a headshot
        this.sparks.spawn(best.point, new THREE.Vector3(0, 1, 0), headshot ? 0xffaa22 : 0xff3344);
        Sfx.hit();
        this.damageNumbers.spawn(best.point, Math.round(dmg), headshot);
        // Hitmarker: only when the shooter is the local player (kill=true if this hit kills).
        if (shooter.isLocal) this.hud.showHitmarker(best.target.health <= 0);
        if (best.target.isLocal) {
          Sfx.hurt();
        }
        // Per-animal hurt voice: the VICTIM speaks in their own animal's voice.
        this.voice.playAnimal(best.target.animalId, 'hurt');
        if (best.target.health <= 0) {
          best.target.health = 0;
          best.target.alive = false;
          best.target.deaths += 1;
          shooter.score += 1;
          if (best.target.view) best.target.view.setVisible(false);
          const victimName = best.target.isLocal ? 'You' : best.target.id;
          const shooterName = shooter.isLocal ? 'You' : shooter.id;
          const verb = headshot ? 'headshotted' : 'fragged';
          this.hud.addKill(`${shooterName} ${verb} ${victimName}`);
          Sfx.kill();
          // Per-animal voices: KILLER taunts the kill, VICTIM cries death (each in their own voice).
          this.voice.playAnimal(shooter.animalId, 'kill');
          this.voice.playAnimal(best.target.animalId, 'death');
          if (shooter.score > 0 && shooter.score % 5 === 0 && shooter.score !== this._lastFragMilestone) {
            this._lastFragMilestone = shooter.score;
            this.voice.play('fragMilestone');
          }
          this.respawnTimers.set(best.target.id, MATCH.respawnDelay);
          // Killstreak: local killer increments, local victim resets.
          if (shooter.isLocal) {
            this.killstreak += 1;
            this.hud.setKillstreak(this.killstreak);
          }
          if (best.target.isLocal) {
            this.killstreak = 0;
            this.hud.setKillstreak(0);
          }
          if (shooter.score >= this.match.fragTarget) this.endMatch();
        }
      } else {
        this.sparks.spawn(best.point, new THREE.Vector3(0, 1, 0), 0xffd24a);
      }
    } else {
      _shotFar.copy(origin).addScaledVector(dir, MAX);
      this.tracers.spawn(_shotMuzzle2, _shotFar);
    }
  }
}

// Body box hit test with a separate head zone (top ~0.3m of the capsule).
// sizeMul widens/tightens the box so bigger animals are easier to hit.
// Returns { dist, point, head } or null.
function playerRayHit(player, origin, dir, maxDist) {
  const sm = player.sizeMul || 1;
  const r = 0.5 * sm, h = 1.8 * sm;
  _rayBoxMin.set(player.position.x - r, player.position.y, player.position.z - r);
  _rayBoxMax.set(player.position.x + r, player.position.y + h, player.position.z + r);
  _rayBox.set(_rayBoxMin, _rayBoxMax);
  _ray.set(origin, dir);
  const hit = _ray.intersectBox(_rayBox, _rayHit);
  if (!hit) return null;
  const dist = origin.distanceTo(hit);
  if (dist > maxDist) return null;
  // Head zone: top 0.3m of the hitbox. Head center sits at y+1.55..y+h.
  const head = hit.y >= player.position.y + h - 0.3;
  return { dist, point: hit.clone(), head };
}

function applyFalloff(damage, dist, start, end) {
  if (dist <= start) return damage;
  if (dist >= end) return damage * 0.4;
  const t = (dist - start) / (end - start);
  return damage * (1 - 0.6 * t);
}
