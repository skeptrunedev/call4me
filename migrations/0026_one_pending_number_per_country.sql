-- One number per country waiting on the carrier per account: two purchases racing (an agent
-- retrying a request it gave up on) can't both be charged.
CREATE UNIQUE INDEX numbers_one_pending ON numbers(account_id, country) WHERE status = 'pending';
