/* Свет, окружение и тонирование.
   Один и тот же модуль в редакторе и во вьюере: если развести их по
   разным файлам, запечённая модель начнёт выглядеть не так, как её
   настраивали, и разницу будет не на что списать. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function setupLook(renderer, scene, scn = {}) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = scn.exposure ?? 0.8;

  // студийное окружение вместо HDR-файла — ничего не тянем с сети
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const key  = new THREE.DirectionalLight(0xfff1dd, 1.0); key.position.set(3.5, 4.5, 5);
  const rim  = new THREE.DirectionalLight(0x9dff6a, 0.8); rim.position.set(-4.5, 1.5, -3);
  const fill = new THREE.DirectionalLight(0xbdd8ff, 0.45); fill.position.set(-2.5, -3, 4);
  scene.add(key, rim, fill);
  return { key, rim, fill };
}
