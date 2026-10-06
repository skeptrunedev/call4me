---
title: "Meta Muse for small business: ask suppliers for comparable quotes by phone"
seoTitle: "Meta Muse supplier quotes by phone"
subtitle: Give every supplier the same phone brief. Includes published price preparation, questions for comparable delivered quotes and a worksheet for actual call outcomes.
description: Prepare supplier calls in Meta Muse with one shared specification, published prices, approval boundaries and a downloadable phone quote worksheet.
date: 2026-10-05
tags: meta muse, small business, ai agents, supplier quotes
authors: nick
imageAlt: Supplier phone calls share one specification and return comparable quotes with unresolved costs visible
---

**Ask Muse to prepare supplier calls around one shared specification, then compare the answers it actually gets.** Use the phone to clarify dimensions, delivery charges and timing that published listings leave open. A useful quote identifies the exact order, who answered and which charges remain unconfirmed.

Meta announced [Muse for Small Business](https://about.fb.com/news/2026/09/introducing-muse-small-business/) on September 29. It adds business skills and connectors, including custom connections for services outside the built in list. A supplier calling task is a practical use case: research the exact products, prepare one question set and ask each approved supplier about the same quantity and destination. This guide uses the consumer Muse app with a Call4me custom connection, rather than Muse Code.

We researched the published listings below on October 5, 2026. We did not request a supplier quote, make a call or execute this workflow in Muse. The delivered cost example later in this article is synthetic and is labeled accordingly.

## Define the order before asking for a winner

Our example scope is 25 brown corrugated boxes advertised as 12 by 12 by 12 inches with a 32 ECT strength rating. No delivery address, deadline, account discount or approved substitute was supplied. Exact inside versus outside dimensions still need checking where a listing does not make that distinction clear.

That is enough for a shortlist of published products. It is insufficient for a delivered price comparison. A stronger box, a subscription discount or a price tier for hundreds of boxes should not silently replace the requested specification or quantity.

Send Muse this brief, also available as a [complete text download](/static/blog/resources/meta-muse-supplier-quotes/supplier-research-prompt.txt):

> Prepare supplier calls through Call4me for 25 brown corrugated boxes advertised as 12 by 12 by 12 inches, rated 32 ECT. Read the official listings for Staples model 121212, Fisher Scientific NC1810018 and PackagingSupplies.com's matching product. Keep inside dimensions separate from advertised dimensions. Ask me for the delivery destination, deadline, essential specifications and identity I authorize sharing. Verify Call4me access with a balance request without dialing. Find each supplier's relevant published sales number on its official site. Show the source, exact shared questions, approved buyer facts and a five minute limit for each proposed call, then wait for approval of those specific calls. Until approval, research only. After approval, check the general category requirements and live calling schema, call only the approved suppliers with call4me_place_call.max_minutes set to 5 for each call. Follow each same returned call ID with call4me_get_call until that call ends, return its transcript and retrieve available evidence with call4me_get_recordings. Ask about matching SKU, quantity, dimensions, merchandise, shipping, taxes, surcharges, arrival estimate and quote validity. Do not log in, submit forms, subscribe, order, accept terms, leave voicemail or arrange callbacks. Record who answered, phone statements and unresolved costs separately from the published price baseline. Do not choose a delivered cost winner with required charges unknown.

## Use published prices to prepare precise calls

All prices are displayed USD merchandise prices observed October 5, not firm quotes for your order. The arithmetic uses each listed pack count.

| Supplier listing | Published pack | Merchandise per box | What remains to confirm |
| :--- | :--- | :--- | :--- |
| [Staples model 121212](https://www.staples.com/12-x-12-x-12-standard-shipping-boxes-32-ect-kraft-25-bundle-121212/product_415595) | $36.69 for 25, brown kraft, 32 ECT | About $1.47 | Dimensions convention, your destination, taxes and delivery |
| [Fisher Scientific NC1810018](https://www.fishersci.com/shop/products/12x12x12-corrugated-boxes-1/NC1810018), Uline supplier item S18344PK | $42.25 for 25, 32 ECT | $1.69 | Color, dimensions convention, account price, shipping, surcharges and delivery |
| [PackagingSupplies.com matching listing](https://www.packagingsupplies.com/products/12-x-12-x-12-corrugated-boxes) | $31.90 for 25, brown, 32 ECT | About $1.28 | Shipping, taxes and delivery |

Staples displayed free delivery and an October 6 arrival to Natick, Massachusetts in the retrieved page. That is the page's configured location, not an address supplied for this example. We did not carry that delivery promise into our comparison.

Fisher Scientific's page asks users to sign in to check their own price and notes possible supplier surcharges. Its displayed amount is useful for initial merchandise comparison, but it does not establish your final checkout price. Its retrieved description did not explicitly establish the brown color requirement, so that row needs a specification check as well.

PackagingSupplies.com publishes brown color, 32 ECT and inside dimensions. Our final source check exposed $31.90 for one bundle of 25. Its lower prices for five or ten bundles do not apply to this quantity. Shipping is calculated at checkout, so the delivered total remains unknown.

The [downloadable source report](/static/blog/resources/meta-muse-supplier-quotes/published-offers.md) includes every source and open question. The [structured offer data](/static/blog/resources/meta-muse-supplier-quotes/published-offers.json) keeps numeric prices separate from unknown fields.

## A cheaper box can cost more delivered

The following is a **synthetic worked example**. Supplier A and Supplier B are fictional. None of these amounts came from a vendor quote or a Call4me conversation.

| Fictional order for 25 matching boxes | Supplier A | Supplier B |
| :--- | :--- | :--- |
| Merchandise | $30.00 | $40.00 |
| Shipping | $18.00 | $4.00 |
| Other fees | $2.00 | $0.00 |
| Tax | $0.00, assumed for this exercise | $0.00, assumed for this exercise |
| Delivered total | $50.00 | $44.00 |
| Delivered cost per box | $2.00 | $1.76 |

Supplier B has the higher merchandise price and the lower delivered total. That conclusion depends on the stated inputs and assumes the products meet the same requirements. Tax is zero only for the exercise; an actual quote must supply the applicable amount.

Download the [complete calculation example](/static/blog/resources/meta-muse-supplier-quotes/synthetic-comparison.json) to inspect the inputs and calculated totals. To compare your own orders, sum merchandise, shipping, tax and other required fees, then divide by the number of usable units. If a required charge is unknown, the delivered total stays unknown.

## Give every approved supplier the same phone questions

Before seeking actual quotes, supply the shipping destination, deadline, intended contents and any mandatory inside dimensions. Product suitability matters before price ranking. Do not assume that every 32 ECT listing is appropriate for a particular load or carrier requirement.

Use this shared question set for each approved supplier:

1. Does this exact SKU meet the brown color, required inside dimensions and 32 ECT specification? What pack quantity applies?
2. What is the merchandise total for 25 usable boxes, without a subscription or a larger quantity tier?
3. What shipping, tax and required surcharges apply to the supplied destination?
4. What arrival estimate can you give for the supplied deadline, and what still needs confirmation?
5. How long does this quote apply, and which returns terms affect this order?

Treat a phone price as an oral estimate or quote attributed to the respondent, not a written firm proposal. Ask whether the respondent can provide a complete quote by phone. If a written proposal or checkout is required, record that next step without submitting it automatically. Keep the exact respondent's answers separate from website prices and agent calculations.

The [sourcing worksheet](/static/blog/resources/meta-muse-supplier-quotes/quote-brief.md) contains the fields to fill in and a ready to adapt question list. Blank buyer details deliberately remain blank. It is a preparation document, not an email that has been sent.

## Check the connection, approve contact, then follow each call

Meta's [official connector instructions](https://www.meta.com/help/artificial-intelligence/1687253048996149/) explain custom connections. Use the [consumer Muse connection guide](/blog/meta-muse-ai-agent-phone-calls), then request `call4me_get_balance` without authorizing a call. Continue only after an authenticated response and discovery of the calling tools. Our Muse setup evidence establishes that balance check; it does not establish these supplier calls.

Verify the relevant sales number on each supplier's own site. This article does not supply unverified sales numbers. The worksheet deliberately leaves those fields blank. A product SKU or a search snippet is not a phone number source. Show the selected recipient, source, questions, buyer identity and five minute limit before requesting approval of the particular calls.

After approval, use the live schema rather than assuming a generic payload works:

```text
call4me_get_requirements(category: "general")
Resolve missing authorized buyer facts
call4me_place_call for an approved supplier, max_minutes: 5
call4me_get_call until the call ends
Collect transcript and available recording
Repeat for the remaining specifically approved suppliers
Compare phone answers against the published baseline
```

This is a planned sequence, not an executed Muse session. If a requirement or call cannot be completed, record that result. Do not replace a failed call with an imagined quote.

| Call outcome | How it belongs in the comparison |
| :--- | :--- |
| Human supplies all required costs for the same order | Record the statement, identity or department, date and transcript; calculate a total only from complete charges |
| Automated system repeats a published price | Label it automated and preserve the source; missing delivery charges stay open |
| Supplier requires a written proposal or checkout | Record the process needed; do not present a firm delivered quote |
| Voicemail, unavailable staff or incomplete answers | Keep the quote unresolved; do not leave a message or arrange a callback without permission |

A statement about free shipping should identify the destination and order it applies to. If the caller posts a question for missing information, answer with approved facts or pause for the buyer; the agent should not invent an address to keep the conversation going.

The [recorded private dining workflow](/blog/agent-web-research-phone-calls-sf-private-dining) shows real Codex and Claude Code calls that reached automated concierges and voicemail. It demonstrates why following the transcript matters: a call can end without producing the requested quote. It does not establish Muse execution.


For a smaller introductory task, use [your first useful Muse task](/blog/meta-muse-first-task). For the separate developer client, see [Muse Code MCP phone calls](/blog/muse-code-mcp-phone-calls). If you use Grok Bot, our [reusable skills guide](/blog/grok-bot-reusable-skills), [templates](/blog/grok-bot-templates) and [template troubleshooting](/blog/grok-bot-template-troubleshooting) cover repeatable task structures. The [Grok Bot versus Muse comparison](/blog/grok-bot-vs-meta-muse) explains the client differences.

Accept the final shortlist when its specifications match, its numbers have sources, and its unknowns are explicit. A supplier becomes the cheapest delivered option only after the whole order can be compared.
