// The flight's music, as the rest of the site asks for it. What is actually heard is decided by the music
// director (lib/musicDirector.ts): by default the embedded official recordings of Čiurlionis's Miške and Jūra,
// each world at a section of its own; the hosted piano recording (lib/flightHosted.ts) when a stream cannot play
// or when it is chosen.
//
//   flightMusicTo(key)     the plane is in the world whose `music` key this is (worlds/voyage.ts)
//   flightMusicStop(fade)  landing: fade out and let go
//   flightMusicVolume(v)   the flight's own quieting (the kings' wood), 0..1
//   flightMusicPrime()     inside a tap that leads to a flight a moment later (the phone's Fly shortcut)
import { musicFlight, musicFlightStop, musicFlightVolume, musicPrime } from "@/lib/musicDirector";

export { FLIGHT_CREDIT, FLIGHT_PARTS, FLIGHT_TRACKS, useFlightCredit, type FlightTrack } from "@/lib/flightHosted";
export const flightMusicTo = (key: string) => musicFlight(key);
export const flightMusicStop = (fade = 5) => musicFlightStop(fade);
export const flightMusicVolume = (v: number) => musicFlightVolume(v);
export const flightMusicPrime = () => musicPrime();
