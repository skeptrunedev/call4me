# Reddit Ads attribution

Call4me records paid Reddit landings itself and keeps that data separate from Reddit Ads' attributed clicks and views. The internal dashboard uses the first recorded Reddit visit for customer cohorts. Reddit's reporting can also include view-through conversions and its own attribution windows, so the numbers are expected to differ.

## Landing URL parameters

Use this query template on every Reddit ad and replace the values/macros in Ads Manager:

```text
utm_source=reddit&utm_medium=paid&utm_campaign=<campaign-name>&campaign_id=<campaign-id>&audience=<audience-name>&ad_group_id=<ad-group-id>&ad_name=<ad-name>&ad_id=<ad-id>&creative_name=<creative-name>&creative_id=<creative-id>
```

Reddit appends `rdt_cid` to eligible ad clicks. Call4me persists it for 90 days. It accepts both the explicit names above and common aliases such as `utm_id`, `utm_term`, `utm_content`, and `adgroup_id`.

## Required production configuration

1. In Reddit Ads Events Manager, configure one data source for both Reddit Pixel and Conversions API.
2. Set `REDDIT_PIXEL_ID` as a public Worker variable.
3. Generate a conversion access token and set it as the Worker secret `REDDIT_CAPI_TOKEN`.
4. Temporarily copy the Events Manager test id into `REDDIT_TEST_ID`, run a test purchase/call, and verify metadata, match keys, and matching conversion ids. Remove `REDDIT_TEST_ID` before launch.
5. Confirm the standard `Purchase` and `SignUp` events and custom `First payment`, `First completed call`, `Returning caller`, and `Task resolved` events in Events Manager. Purchase is sent by both Pixel and CAPI with the same `conversion_id`; the remaining server-only milestones are not duplicated.
6. Disable automated advanced matching and enhanced metadata sharing in Pixel settings. Call4me supplies only an internal external id to the browser Pixel and deliberately does not load it on account, transcript/recording, admin, examples, or blog pages.

The delivery outbox stores payload, attempts, HTTP status, response/error, and delivery time. Failed or credential-blocked events retry on the 15-minute scheduled job, up to eight network attempts. The dashboard shows delivery health and recent failures.

No call transcript, recording, phone number, destination, brief, business, or task category is included in Reddit events. Matching data is limited to the Reddit click/visitor, browser IP and user agent when available, and SHA-256 hashes of the account id and real email.

## Spend

The dashboard reads `reddit_ad_spend`. To sync it, obtain an Ads API token with `adsread` and the ad account id, then run:

```sh
REDDIT_ADS_ACCESS_TOKEN=... REDDIT_AD_ACCOUNT_ID=... npm run reddit:spend -- --remote --days=90
```

The report pulls UTC daily spend by campaign and ad. Spend is matched back to the richer campaign/audience/ad/creative labels captured on landing URLs. The Conversions API token cannot be used for Ads API reporting.
