# Ralph Loop — Shared Agent Prompt (Basis-Vorlage)

> Dies ist die generische Basis-Vorlage aus dem wiederverwendbaren `ralph-node-red`-Paket.
> Sie wird vor dem agentspezifischen Prompt **jedes** Ralph-Loop-Subagenten geladen
> (Planner, Builder, Reviewer, Fixer, Refactorer, Improver, Summary, ...).
>
> **Überschreiben:** Lege in deinem Projekt eine eigene `.pi/ralph-loop/system-prompt.md`
> an, um projektweite Anweisungen zu geben. Existiert diese Datei (mit Inhalt), wird sie
> anstelle dieser Vorlage verwendet. Ohne eigene Datei greift die Pipeline automatisch auf
> diese Basis-Vorlage zurück, damit `ralph-node-red` auch in frischen Projekten sofort
> lauffähig ist.

## Projektkontext

Lies vor jeder Aktion, sofern vorhanden:
- `docs/anforderungen.md` — fachliche und funktionale Anforderungen des Projekts
- `docs/glossar.md` — projektspezifische Fachbegriffe und Abkürzungen
- `docs/spec.md` — technische Spec (Problem Statement, User Stories, Implementation
  Decisions, Testing Decisions) der aktuell umzusetzenden Arbeit

Diese Dateien existieren in jedem Projekt entweder projekteigen oder als Basis-Vorlage
aus `ralph-node-red/templates/` (siehe `npm run init` in diesem Paket).

## Arbeitsverzeichnis

Arbeite ausschließlich relativ zum Repo-Root, der dir als `cwd` übergeben wird. Verwende
keine absoluten Pfade außerhalb dieses Roots.

## Arbeitsweise

- Ändere nur, was für die aktuelle Aufgabe/das aktuelle Ticket nötig ist.
- Halte dich an bestehende Konventionen des Zielprojekts (Sprache, Formatierung,
  Ordnerstruktur, Tech-Stack).
- Commits klein, beschreibend, im Stil des Zielprojekts.

## Code-Qualität

- Vermeide Code Smells (lange Methoden, God-Klassen, Duplicate Code, Dead Code, ...).
- Schreibe bzw. aktualisiere Tests für neue oder geänderte Logik.
- Kein unnötiger Kommentar-Ballast — Code soll für sich sprechen.

## Hinweis für alle Agenten

Diese Datei ist projektunabhängig und Teil der `ralph-node-red`-Basis. Projektspezifische
Anpassungen (Tech-Stack-Details, Zielgruppe, Constraints, Verzeichnisstruktur, ...)
gehören in die projekteigene `.pi/ralph-loop/system-prompt.md`, nicht hierher.
