# Still With You — Backend Contract v0.6

**Status:** Cancelled / superseded by [v0.7](./backend-contract-v0.7.md).

v0.6 was never deployed. Do not implement or call proposed v0.6 paths such as:

- `/quick-question`
- `/persons/{id}/answers`

Canonical deployed paths (see v0.7):

- `GET /v1/families/{id}/home`
- `GET` / `PUT /v1/families/{id}/focus`
- `GET` / `POST /v1/people/{id}/facts`
- `POST /v1/people/{id}/facts/skip`
- `PATCH` / `DELETE /v1/facts/{id}`
