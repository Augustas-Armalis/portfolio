// The flight's music, as the rest of the site asks for it. What is actually heard is decided by the music
// director (lib/musicDirector.ts): at home the field's music (field.mp3), handing over to the forest's (forest.mp3)
// in the forest and by the cave and on through Paradise; the sea's (sea.mp3) from The Offering to the end.
//
//   flightMusicTo(key)          the plane is in the world whose `music` key this is (worlds/voyage.ts)
//   flightMusicForest(k)        at home: how far into the forest (or by the cave) the plane is, 0..1
//   flightMusicStop(fade, home) the flight is over: landing (home, the default) hands the music back to the
//                               field; otherwise it simply fades out and lets go
//   flightMusicVolume(v)        the flight's own quieting (the kings' wood), 0..1
//   flightMusicCrossing(phase) the cloud between worlds (voyage.phase, every frame of the flight): the music ducks into it
//                               and out after the swap, and a piece due to change waits for it to be over
//   flightMusicPrime()          inside a tap that leads to a flight a moment later (the phone's Fly shortcut)
import { musicCrossing, musicFlight, musicFlightStop, musicFlightVolume, musicForest, musicPrime } from "@/lib/musicDirector";

export const flightMusicTo = (key: string) => musicFlight(key);
export const flightMusicForest = (k: number) => musicForest(k);
export const flightMusicStop = (fade = 7, home = true) => musicFlightStop(fade, home);
export const flightMusicVolume = (v: number) => musicFlightVolume(v);
export const flightMusicPrime = () => musicPrime();
export const flightMusicCrossing = (phase: "open" | "closing" | "hold" | "opening") => musicCrossing(phase);
