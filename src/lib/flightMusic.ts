// The flight's music, as the rest of the site asks for it. What is actually heard is decided by the music
// director (lib/musicDirector.ts): at home the field's music, handing over to Čiurlionis's Miške in the forest and
// by the cave; Miške from there through the worlds up to The Offering, Jūra from the Sea Finale to the end (both
// embedded official players); the hosted piano recording (lib/flightHosted.ts) when a stream cannot play.
//
//   flightMusicTo(key)          the plane is in the world whose `music` key this is (worlds/voyage.ts)
//   flightMusicForest(k)        at home: how far into the forest (or by the cave) the plane is, 0..1
//   flightMusicStop(fade, home) the flight is over: landing (home, the default) hands the music back to the
//                               field; otherwise it simply fades out and lets go
//   flightMusicVolume(v)        the flight's own quieting (the kings' wood), 0..1
//   flightMusicPrime()          inside a tap that leads to a flight a moment later (the phone's Fly shortcut)
import { musicFlight, musicFlightStop, musicFlightVolume, musicForest, musicPrime } from "@/lib/musicDirector";

export { FLIGHT_CREDIT, FLIGHT_PARTS, FLIGHT_TRACKS, useFlightCredit, type FlightTrack } from "@/lib/flightHosted";
export const flightMusicTo = (key: string) => musicFlight(key);
export const flightMusicForest = (k: number) => musicForest(k);
export const flightMusicStop = (fade = 7, home = true) => musicFlightStop(fade, home);
export const flightMusicVolume = (v: number) => musicFlightVolume(v);
export const flightMusicPrime = () => musicPrime();
