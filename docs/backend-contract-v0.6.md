# Still With You — Backend Contract v0.6

**Status:** Cancelled. Canonical spec is [v0.8](./backend-contract-v0.8.md). [v0.7](./backend-contract-v0.7.md) is superseded (still describes the deployed API until v0.8 ships).

v0.6 was never deployed. Do not implement or call proposed v0.6 paths such as:

- `/quick-question`
- `/persons/{id}/answers`

Canonical paths (see v0.8; deployed API is still v0.7 until family tree ships):

- `GET /v1/families/{id}/home`
- `GET` / `PUT /v1/families/{id}/focus`
- `GET` / `POST /v1/people/{id}/facts`
- `POST /v1/people/{id}/facts/skip`
- `PATCH` / `DELETE /v1/facts/{id}`
