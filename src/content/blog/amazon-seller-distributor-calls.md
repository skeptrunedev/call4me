---
title: "How Amazon sellers can have Claude call their distributor"
seoTitle: "Have Claude call your Amazon distributor"
subtitle: Connect your Amazon Seller Central and Ads data to Claude with Marketplace Ad Pros, then let call4me phone your distributor for a ship date. Setup, a copy-paste prompt, and what comes back.
description: "Connect Amazon Seller Central and Ads data to Claude with Marketplace Ad Pros, then have call4me phone your distributor for a ship date. Setup and prompts."
date: 2026-10-14
tags: claude, amazon sellers, mcp, supply chain
authors: nick
imageAlt: Claude reads Amazon stock with Marketplace Ad Pros, calls the distributor with call4me, and reports the ship date in the chat
---

If you sell on Amazon, Claude can now check which products are about to run out and phone your distributor to find out when the next shipment leaves. You need two connectors in the same chat: **Marketplace Ad Pros** for your Amazon Seller Central and Amazon Ads data, and **call4me** for the call. Claude reads your stock and ad spend from the first, writes a call brief with your purchase order details, and uses the second to place the call once you approve it. You get the outcome, the transcript and the recording back in the same conversation.

## Why a phone call, and why now

Amazon tells you what you have in stock and what's selling. It doesn't tell you when your distributor will actually ship. That answer usually lives in an email thread that went quiet, or with someone who only picks up the phone.

The timing matters because your ads keep spending while you wait. If a best-seller has nine days of stock left and the next shipment is three weeks out, you probably want to pull ad budget before you sell out and lose ranking. If it ships Friday, you keep spending. One five-minute call decides which, and it's the kind of call that sits on a to-do list for days.

The calls Amazon sellers make most often are:

- **Distributor or supplier:** has the purchase order shipped, and if not, what's the new date?
- **Freight forwarder:** where is the container or pallet, and when will it reach the Amazon warehouse?
- **Prep center or 3PL:** when will stock be labeled and ready to send to FBA?
- **Manufacturer:** what's the lead time on a reorder before you commit to a launch date?

Each one needs the same two things: your Amazon numbers, so you know which product matters, and someone to make the call. Claude can now do both.

## What you need

- **A Claude plan that allows custom connectors.** Free allows one custom connector, so you'll need a paid plan to run both. On Team and Enterprise, an Owner may need to add them.
- **A Marketplace Ad Pros account** with Seller Central connected (Amazon Ads too if you want ad spend in the answer). Connecting is free.
- **call4me credits.** Calls cost $0.25 a minute from pickup and half that while on hold, prepaid from $10. Unanswered, busy and failed calls are free.

## Step 1: Connect your Amazon data with Marketplace Ad Pros

[Marketplace Ad Pros](https://marketplaceadpros.com/) connects Amazon Ads, Seller Central and Vendor Central to Claude, ChatGPT and other MCP clients. It's read-only by default, so connecting it doesn't let Claude change your campaigns or listings.

1. Sign up at [app.marketplaceadpros.com](https://app.marketplaceadpros.com/signup) and connect Seller Central and Amazon Ads. Each connection is a Login with Amazon approval; you don't share a password.
2. In Claude, go to **Customize > Connectors**, click **+ Add**, then **Add custom connector**.
3. Name it `Marketplace Ad Pros`, enter `https://app.marketplaceadpros.com/mcp`, and sign in when asked.

To check it works, ask Claude: *"Using Marketplace Ad Pros, show my FBA inventory for my top 10 products by sales."*

## Step 2: Add call4me

1. In **Customize > Connectors**, click **+ Add**, then **Add custom connector**.
2. Name it `call4me` and enter `https://call4.me/mcp`.
3. Click **Continue**, keep the detected authentication settings, and click **Add**. Sign in to call4me when asked.

Turn both connectors on in the chat you're going to use. The [Claude setup guide](/blog/claude-phone-calls) covers Team and Enterprise plans and the API key option.

## Step 3: Find the products that need a call

Start with the Amazon side, and don't let Claude dial yet:

> Using Marketplace Ad Pros, find SKUs where fulfillable FBA stock divided by average daily units sold over the last 30 days is under 21 days. Include anything already inbound to Amazon, and show ad spend on each SKU over the last 7 days. Flag any SKU you can't match between inventory and ads. Do not place any calls.

Claude comes back with a short list: each SKU, its estimated days of cover, what's on the way to Amazon, and what you're spending to advertise it. That list is the reason for the call. A product with eight days of cover and $400 a week of ad spend is worth a call today. One with 40 days of cover can wait.

Two things to know about the numbers. Days of cover is an estimate: Amazon reports quantities, so Claude divides by your recent sales. And FBA stock doesn't include inventory in Amazon Warehousing and Distribution (AWD) or stock you ship yourself; ask for those separately if you use them.

## Step 4: Brief the call and let call4me make it

Amazon doesn't know your distributor's number, your PO number or the date they promised, so add those yourself:

> For the SKUs from [distributor name], draft a call brief for [their number]. We're [your company]. Ask about PO [number], promised to ship [date]: has it shipped, and if not, what's the new ship date, and can part of it ship this week? Ask them to confirm the date by email to [your email]. Say you're an AI assistant calling for [your company]. Don't agree to any price, quantity or payment changes. If you reach voicemail, leave a short message asking for an email reply. If they ask you to verify account or payment details, end the call. Keep it under 15 minutes. Show me the brief before you call.

Read the brief, fix anything that's wrong, then tell Claude to place the call with call4me.

A few habits that make these calls go well:

- **Put the reference numbers in the brief.** The caller only knows what the brief says. It doesn't read your Amazon data or your email during the call.
- **Ask for the date in writing.** Treat what you hear on the phone as an update to confirm, not a commitment.
- **Say who's calling.** call4me's caller tells people it's an AI when they ask. If you'd rather it say so up front, put that in the brief, as the prompt above does.
- **Set a time limit.** A call still on hold when it reaches the limit keeps waiting while you have credit, so pick a sensible maximum.

## What comes back

While the call runs, Claude checks its status until it ends. A call ID only means the call was submitted, not that anyone answered. When it finishes, Claude reports what the distributor said against each question in your brief, lists anything still unanswered, and can fetch the transcript and recording.

Then go back to the Amazon side in the same chat:

> The new ship date for PO [number] is [date]. Using Marketplace Ad Pros, show which campaigns are spending on these SKUs and how much budget I'd save over the next 3 weeks by pausing or cutting them.

Marketplace Ad Pros is read-only by default, so Claude will show you the campaigns and the numbers, and you decide what to change.

## Other calls to try

Use the same pattern for the rest of your supply chain:

- **Freight forwarder:** "Using Marketplace Ad Pros, show my open inbound shipments to Amazon. Then brief a call to [forwarder] about [container or booking number]: where is it now, and what's the delivery date to the Amazon warehouse?"
- **Prep center:** "Brief a call to [prep center] asking when the [units] of [SKU] that arrived [date] will be labeled and ready to ship to FBA."
- **Manufacturer:** "Using Marketplace Ad Pros, show my 90-day sales trend for [SKU]. Then brief a call to [manufacturer] asking for the current production lead time on [quantity] units."

## Troubleshooting

**Claude can't see your inventory.** Seller Central isn't connected in Marketplace Ad Pros, or the connector is off in this chat. Inventory comes from Seller Central, not Amazon Ads.

**Claude doesn't offer to place a call.** The call4me connector isn't turned on in this chat. Check the connectors menu in the chat window.

**The call ended early or Claude stopped checking.** Ask Claude to check the same call ID again rather than placing a new call.

**You sell through Vendor Central.** Marketplace Ad Pros connects Vendor Central too, but vendor inventory comes from reports rather than FBA stock, so ask Claude about your vendor inventory and open purchase orders instead.

## Related guides

- [How to have your Amazon Ads agent call your distributor](https://marketplaceadpros.com/guides/amazon-ads-agent-call-your-distributor/) (Marketplace Ad Pros)
- [Seller Central MCP server](https://marketplaceadpros.com/amazon-seller-central-mcp-server/) (Marketplace Ad Pros)
- [Can Claude make phone calls? Add call4me as a custom connector](/blog/claude-phone-calls)
