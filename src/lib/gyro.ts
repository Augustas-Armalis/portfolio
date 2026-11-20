import * as THREE from "three";

// The phone as the eye. While this is on, the way the phone is held decides
// where the flight's camera looks: turn round with it and the world turns.
//
//   gyroStart()   ask for the sensors (iOS wants the question asked from a
//                 tap) and wait for a first reading. Resolves false when
//                 there are none or the visitor said no: the caller simply
//                 stays with dragging.
//   gyroStop()    let go of the sensors.
//   gyroCentre()  whatever way the phone is held now is "straight ahead".
//   gyroLook()    the look, as a turn (yaw, + is left) and a tilt (pitch,
//                 + is up) from straight ahead, in radians, or null.
//   gyroNudge()   a drag while the phone is the eye moves "straight ahead".
//
// Readings are low-passed here (the sensor is noisy at rest) and eased again
// by the camera that follows them.

type Orient = DeviceOrientationEvent & { webkitCompassHeading?: number };
type Asker = { requestPermission?: () => Promise<"granted" | "denied"> };

const S = { on: false, fresh: false, yaw: 0, pitch: 0, y0: 0, p0: 0, centre: true, fwd: new THREE.Vector3(0, 0, -1) };
const zee = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const q = new THREE.Quaternion();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // the camera looks out of the back of the phone
const v = new THREE.Vector3();
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function onOrient(e: Orient) {
  if (e.alpha === null || e.beta === null || e.gamma === null) return;
  const rad = Math.PI / 180;
  const screen = ((window.screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number) * rad;
  euler.set(e.beta * rad, e.alpha * rad, -e.gamma * rad, "YXZ");
  q.setFromEuler(euler).multiply(q1).multiply(q0.setFromAxisAngle(zee, -screen));
  v.set(0, 0, -1).applyQuaternion(q);
  // low-pass: most of the old reading, some of the new (about a tenth of a second at 60 readings a second)
  if (S.fresh) S.fwd.lerp(v, 0.3).normalize();
  else S.fwd.copy(v);
  S.yaw = Math.atan2(-S.fwd.x, -S.fwd.z);
  S.pitch = Math.asin(THREE.MathUtils.clamp(S.fwd.y, -1, 1));
  if (S.centre) {
    S.centre = false;
    S.y0 = S.yaw;
    S.p0 = S.pitch;
  }
  S.fresh = true;
}

export const gyroAvailable = () => typeof window !== "undefined" && typeof DeviceOrientationEvent !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

export async function gyroStart(): Promise<boolean> {
  if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") return false;
  try {
    const ask = (DeviceOrientationEvent as unknown as Asker).requestPermission;
    if (typeof ask === "function" && (await ask()) !== "granted") return false;
  } catch {
    return false;
  }
  S.fresh = false;
  S.centre = true;
  window.addEventListener("deviceorientation", onOrient);
  // a device without the sensors never sends a reading
  const t0 = performance.now();
  while (!S.fresh && performance.now() - t0 < 1200) await new Promise((r) => window.setTimeout(r, 60));
  if (!S.fresh) {
    window.removeEventListener("deviceorientation", onOrient);
    return false;
  }
  S.on = true;
  return true;
}

export function gyroStop() {
  if (typeof window === "undefined") return;
  window.removeEventListener("deviceorientation", onOrient);
  S.on = false;
  S.fresh = false;
}

export function gyroCentre() {
  S.centre = true;
  if (S.fresh) {
    S.y0 = S.yaw;
    S.p0 = S.pitch;
    S.centre = false;
  }
}

export function gyroNudge(dyaw: number, dpitch: number) {
  S.y0 -= dyaw;
  S.p0 = THREE.MathUtils.clamp(S.p0 - dpitch, -1.4, 1.4);
}

const out = { yaw: 0, pitch: 0 };
export function gyroLook() {
  if (!S.on || !S.fresh) return null;
  out.yaw = wrap(S.yaw - S.y0);
  out.pitch = S.pitch - S.p0;
  return out;
}

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") Object.assign(window, { __gyro: { state: S, look: gyroLook, start: gyroStart, stop: gyroStop, centre: gyroCentre } });
