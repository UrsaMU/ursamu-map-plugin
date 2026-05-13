+MAP

Renders a procedural sector minimap centred on your coordinate. Authored
**overlays** (buildings, caches, faction markers) draw on top of generated
terrain. Use `+map/jump` to scout other sectors as a builder.

SYNTAX
  +map[/<switch>] [<args>]

SWITCHES
  /here              Centre the map on your current coord (default).
  /jump <x> <y> [z]  Move your map cursor (builder+ only).

EXAMPLES
  +map               Render the sector around you.
  +map/here          Same as bare `+map`.
  +map/jump 120 -40  Jump to (120, -40, 0).

SEE ALSO: +help look
