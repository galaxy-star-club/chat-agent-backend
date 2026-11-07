---
name: magica-generation
description: Use Magica's catalog, schema, pricing, execution, and run-status tools for supported media generation.
---
For a Magica generation request, first use `list_magica_models` to select a matching model. Then call `get_magica_model_schema` and `get_magica_model_pricing` before `run_magica_model`.

Pass only fields required by the returned schema. Explain that Magica generation can consume credits before starting a run. After `run_magica_model`, use `get_magica_run` to check for completion and return only URLs or outputs supplied by Magica. Do not invent model IDs, input fields, prices, or generated output.
