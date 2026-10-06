---
title: "Meta Muse for small business: compare supplier quotes without guessing"
seoTitle: "Meta Muse for small business: supplier quotes"
subtitle: Turn published packaging listings into a fair supplier shortlist. Includes a complete sourcing brief, a sourced comparison and a clearly labeled sample for delivery cost math.
description: Compare supplier offers with Meta Muse. Includes a complete research brief, sourced box listings, delivered cost example and downloadable worksheets.
date: 2026-10-05
tags: meta muse, small business, ai agents, supplier quotes
authors: nick
imageAlt: Three supplier offers compared against one specification with delivery costs and unknowns kept visible
---

**Give Muse the same specification for every supplier, then compare what it can actually verify.** A published product price is a starting point. A useful supplier quote also needs the quantity, destination, delivery date, taxes, shipping, surcharges and the terms applying to that order.

Meta announced [Muse for Small Business](https://about.fb.com/news/2026/09/introducing-muse-small-business/) on September 29. It adds business skills and connectors, including custom connections for services outside the built in list. A supplier comparison is a practical use case: research listings first, identify missing information, and prepare focused questions before anyone contacts a vendor.

We researched the published listings below on October 5, 2026. We did not request a supplier quote, make a call or execute this workflow in Muse. The delivered cost example later in this article is synthetic and is labeled accordingly.

## Define the order before asking for a winner

Our example scope is 25 brown corrugated boxes advertised as 12 by 12 by 12 inches with a 32 ECT strength rating. No delivery address, deadline, account discount or approved substitute was supplied. Exact inside versus outside dimensions still need checking where a listing does not make that distinction clear.

That is enough for a shortlist of published products. It is insufficient for a delivered price comparison. A stronger box, a subscription discount or a price tier for hundreds of boxes should not silently replace the requested specification or quantity.

Send Muse this brief, also available as a [complete text download](/static/blog/resources/meta-muse-supplier-quotes/supplier-research-prompt.txt):

> Research published supplier offers for 25 brown corrugated boxes advertised as 12 by 12 by 12 inches, rated 32 ECT. Compare Staples model 121212, Fisher Scientific catalog NC1810018 and PackagingSupplies.com's matching product. Use their own product pages. Keep advertised dimensions separate from confirmed inside dimensions. Record pack count, pack price, currency, strength, shipping, tax, surcharges, delivery and source URL. No destination or deadline has been supplied. Do not invent them or treat a default site's destination as mine. Do not log in, add items to a cart, contact suppliers, submit forms, subscribe or order. Mark unavailable prices and terms unknown. Return a shortlist, merchandise cost per box and the exact missing facts needed for a delivered quote. Do not select a delivered cost winner until those facts are known.

## What the published offers actually tell us

All prices are displayed USD merchandise prices observed October 5, not firm quotes for your order. The arithmetic uses each listed pack count.

| Supplier listing | Published pack | Merchandise per box | What remains to confirm |
| :--- | :--- | :--- | :--- |
| [Staples model 121212](https://www.staples.com/12-x-12-x-12-standard-shipping-boxes-32-ect-kraft-25-bundle-121212/product_415595) | $36.69 for 25, brown kraft, 32 ECT | About $1.47 | Dimensions convention, your destination, taxes and delivery |
| [Fisher Scientific NC1810018](https://www.fishersci.com/shop/products/12x12x12-corrugated-boxes-1/NC1810018), Uline supplier item S18344PK | $42.25 for 25, 32 ECT | $1.69 | Color, dimensions convention, account price, shipping, surcharges and delivery |
| [PackagingSupplies.com matching listing](https://www.packagingsupplies.com/products/12-x-12-x-12-corrugated-boxes) | 25 per bundle, brown, 32 ECT; price unavailable in the retrieved page | Unknown | Current pack price, shipping, taxes and delivery |

Staples displayed free delivery and an October 6 arrival to Natick, Massachusetts in the retrieved page. That is the page's configured location, not an address supplied for this example. We did not carry that delivery promise into our comparison.

Fisher Scientific's page asks users to sign in to check their own price and notes possible supplier surcharges. Its displayed amount is useful for initial merchandise comparison, but it does not establish your final checkout price. Its retrieved description did not explicitly establish the brown color requirement, so that row needs a specification check as well.

PackagingSupplies.com publishes the brown color, 32 ECT specification and inside dimension convention, but the retrieved page did not expose a price. We kept that field unknown. A missing price is a followup question, not an invitation to substitute a remembered number.

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

## Ask only for the facts the research did not answer

Before seeking actual quotes, supply the shipping destination, deadline, intended contents and any mandatory inside dimensions. Product suitability matters before price ranking. Do not assume that every 32 ECT listing is appropriate for a particular load or carrier requirement.

A complete request for a written quote would ask the supplier to identify the exact SKU, quantity, specification, merchandise total, shipping, taxes, surcharges, expected arrival, quote expiration and relevant return terms. Save the supplier's answer next to its date and source. Keep agent calculations in a separate column or section.

The [sourcing worksheet](/static/blog/resources/meta-muse-supplier-quotes/quote-brief.md) contains the fields to fill in and a ready to adapt question list. Blank buyer details deliberately remain blank. It is a preparation document, not an email that has been sent.

## Where Muse connectors and phone calls fit

Public pages are enough to start this task. A private supplier portal or order history could justify a connector later. Meta's [official connector instructions](https://www.meta.com/help/artificial-intelligence/1687253048996149/) explain asking Muse to create a custom connector when a service is not listed. Meta also says it does not review those custom connectors. Review the connection and credential flow before granting access to a business account.

If the missing information needs a conversation, give the caller the same specification and the exact unresolved questions. Distinguish permission to ask a question from permission to purchase, arrange a callback or disclose buyer information. A phone statement about “free shipping” should still identify the destination and order it applies to.

Our [consumer Muse connector test](/blog/meta-muse-ai-agent-phone-calls) established a balance check. It did not establish a completed supplier call. The [recorded private dining workflow](/blog/agent-web-research-phone-calls-sf-private-dining) shows what research plus calling actually produced in Codex and Claude Code, including unanswered questions.

For a smaller introductory task, use [your first useful Muse task](/blog/meta-muse-first-task). For the separate developer client, see [Muse Code MCP phone calls](/blog/muse-code-mcp-phone-calls). If you use Grok Bot, our [reusable skills guide](/blog/grok-bot-reusable-skills), [templates](/blog/grok-bot-templates) and [template troubleshooting](/blog/grok-bot-template-troubleshooting) cover repeatable task structures. The [Grok Bot versus Muse comparison](/blog/grok-bot-vs-meta-muse) explains the client differences.

Accept the final shortlist when its specifications match, its numbers have sources, and its unknowns are explicit. A supplier becomes the cheapest delivered option only after the whole order can be compared.
