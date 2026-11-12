"""Adjust Spotify's Windows audio session without changing playback or system volume."""
import json
import sys


def change_volume(direction):
    from pycaw.pycaw import AudioUtilities
    volumes = []
    for session in AudioUtilities.GetAllSessions():
        process = session.Process
        if process and process.name().casefold() == "spotify.exe":
            volumes.append(session.SimpleAudioVolume)
    if not volumes:
        return "Windows visar ingen ljudkanal för Spotify just nu."
    if direction not in ("down", "up"):
        raise ValueError("unknown volume direction")
    step = -.10 if direction == "down" else .10
    requested = [max(0., min(1., round(vol.GetMasterVolume() + step, 2))) for vol in volumes]
    for vol, target in zip(volumes, requested):
        vol.SetMasterVolume(target, None)
    actual = [vol.GetMasterVolume() for vol in volumes]
    if any(abs(value - target) > .011 for value, target in zip(actual, requested)):
        return "Jag kunde inte bekräfta Spotifys nya volym."
    levels = sorted({round(value * 100) for value in actual})
    if len(levels) == 1:
        return f"Spotifys volym är nu {levels[0]} procent."
    return "Jag har justerat Spotifys ljudkanaler i Windows."


if __name__ == "__main__":
    print(json.dumps(change_volume(sys.argv[1])))
