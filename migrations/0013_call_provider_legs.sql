-- Provider identifiers remain separate from the call row consumed by voice code.
CREATE TABLE call_provider_legs (
  call_control_id TEXT PRIMARY KEY,
  call_leg_id TEXT NOT NULL
);
