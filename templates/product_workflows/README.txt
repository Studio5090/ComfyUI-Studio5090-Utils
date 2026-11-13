Studio5090 Product Workflow Templates
======================================

This directory holds the canonical CREATE/RENDER/CASTING workflow
templates that ship with the toolkit. When a user creates a new
project, each .json file here is auto-copied into the new project's
workflows/ folder, renamed with the project prefix:

  CREATE_TEMPLATE.json   -> <project>_CREATE_v1.json
  RENDER_TEMPLATE.json   -> <project>_RENDER_v1.json
  CASTING_TEMPLATE.json  -> <project>_CASTING_v1.json   (v1.7.0)

The TYPE token is whatever appears before "_TEMPLATE.json" in the
filename. The picker also shows these templates as their own
section, so users can load them directly.

Templates are read-only from the user's perspective. Edit the
project copies, not these source files.
