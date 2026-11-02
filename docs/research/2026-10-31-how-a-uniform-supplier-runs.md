# How a uniform supplier like Total Image Group runs (2026-10-31)

Research to ground the second order-to-cash simulation. Three angles: Total
Image Group (TIG) itself — its public pages, its client stores and its clients'
own uniform pages, plus the photographs of its live Jim2 system already written
up in `docs/backlog.md` (JIM1–JIM31, ORD1–ORD12); the Australian
decorated-apparel trade; and corporate uniform programs and their money.
TIG's own site shows a bot check to automated readers, so its pages were read
through search-result text and its clients' sites. Figures marked
*illustrative* are assumptions for simulation, not facts.

## The work, end to end

1. **Program set-up.** Each client of any size gets its own store on a
   subdomain (TIG reports 100+). A login shows each wearer only their role's
   range; one store can serve departments that order against a subsidy and
   departments that bulk-order. Ranges, delivery, invoicing and ordering can
   differ between groups inside one client.
2. **Allowances.** By dollars or by garment count, per role, employment type or
   location; reset fortnightly, monthly or yearly — in every public council
   policy found, yearly on the financial year with no carry-over. Examples:
   $325/yr full-time pro rata (Upper Lachlan), $400 first year then $300
   (Waroona), 3 tops + 1 outerwear for 20+ hours and 2 + 1 under (Resthaven).
   Overspend is paid **by card at checkout** (Resthaven, SESLHD "personal
   purchase") or becomes **an employee debt** repaid within 6 months or by
   30 June, which blocks next year's allowance while open (Upper Lachlan,
   Waroona). Leaving within 6 months of a first issue claws back 50% (Waroona).
3. **Intake.** A portal order becomes a Jim2 job with Item# `NOP.ONLINE`, the
   store's order number in Serial#, the wearer's email in the description;
   staff-keyed jobs are `SALE`. Personalised packs are **one job per person**
   (name and staff number in Cust Ref), tied by Order#. System comments mark
   Booked, Confirmed, "Ordered On Account — Proceed".
4. **Lines.** A decorated garment is a visible sell line plus hidden component
   lines (embroidery per application, the bought garment) that add up to the
   sell price exactly — never charged on top. Alterations (`ALT.POCKET`) are
   their own lines under the garment. Freight and fuel levy are lines.
5. **Art.** A logo is redrawn free and kept; digitising $45–$95 once, $0 on a
   repeat; a sew-out or digital proof is approved before production (under 10
   units often digital only). Rejections loop.
6. **Buying.** POs raised from jobs, one PO across many jobs with the Job# on
   each line; one personalised job can draw on 5 POs (each garment and the
   embroidery). Suppliers send what they have and back-order the rest;
   2XL–5XL, women's sizes and taped hi-vis are the usual gaps. Indents take
   6–8 weeks (polos, jackets) to ~12 weeks (rugby jerseys).
7. **Decoration.** Embroidery and heat-press in house; screen, sublimation,
   DTF and patches often subcontracted (a PO, freight out and back, the job at
   "ProdExt"). Hi-vis decoration must not cover retroreflective tape (AS/NZS
   4602.1 classes D, N, D/N); UPF claims follow AS 4399:2020.
8. **Packing and despatch.** One satchel per person; the label carries the site
   (numeric Ship# codes with suffixes), Attn, the person (Sender Ref), the job,
   the carrier and connote. Despatch works from the job list grouped by Ship#,
   sorted by availability %; partial despatch and a later consignment of the
   back-ordered sizes are routine. Lines with no weight mis-quote freight.
9. **Invoicing.** GST 10%; a tax invoice of $1,000+ must name the buyer.
   Terms are codes (`30DAYSINV`, 30 EOM). Deposit proforma then "balance only"
   on indents. Allowance spend is billed to the employer, card extras are
   already paid; employers want spend split by cost centre.
10. **Returns.** 14 days (from invoice or delivery, by store), unworn,
    unwashed; exchange or store credit, refunds only for faulty or wrong items;
    a $3.00–$3.50 + GST repack fee without packaging, $15 ex re-delivery on a
    non-faulty return at one store. Name-personalised garments are not
    restockable. Inside TIG today a return is a job comment, a highlighted
    printout and goods left on a desk — no document, no credit note.
11. **Client-held stock.** The warehouse holds a client's stock at agreed levels
    and replenishes it (Sutherland Shire); a rebrand strands it.

## Numbers used by the simulation

| What | Value |
| --- | --- |
| Minimums | 12 branded garments; 500 for custom-made; first order $5,000 (TIG) |
| Embroidery | $9 (100–499) to $20 (1–7) per piece; subcontract $2.50 ex per application |
| Adult size spread | XS 3%, S 13%, M 27%, L 25%, XL 19%, 2XL 8%, 3XL+ 5% |
| Delivery promises | 10 working days (Arcare), 10–14 (Goodstart), 2–3 weeks to site (Resthaven) |
| Return fees | $3.00 + GST (Goodstart, Harvey Norman), $3.50 ex (Arcare), $15 ex (YHA) |
| Terms | 30DAYSINV, 30 EOM |

## Where the ERP stands against this

| Need | Today |
| --- | --- |
| Portal intake once per order, booked New/QUOTE | Built (F01, F26) |
| Goods vs decoration/alteration services, logo master + proof | Built (F02, F09, F31) |
| Combined POs with Job# per line, oldest-first fill, close short | Built (F03, F18, F25) |
| Despatch grouped by Ship#, partial consignments printing only what went | Built (F22, F21 round 2) |
| Credit check counting open orders | Built (F27) |
| Allowance ledger per wearer, funding split per line (allowance / card / payroll) | **Not built** |
| Card-paid portal orders arriving already paid | **Not built** (portal cannot record payment) |
| Returns and credit notes against job lines, return location, fees | **Not built** |
| Cost centre per job / per wearer; consolidated statement per cost centre | **Not built** |
| Stock held for a named client, ring-fenced from other sales | **Not built** |
| Hi-vis class / UPF as product attributes; non-restockable personalised goods | **Not built** |
| Per-wearer name lists on lines | Partly (one job per person; no per-unit name list) |

The second simulation runs the built paths at realistic scale and records,
step by step, where the unbuilt ones force a workaround.

## Sources

TIG and its client stores: totalimagegroup.com.au (our-journey, allocation-subsidy-management,
uniform-management-technology, personalised-online-ordering, multi-location-management, sutherland-shire-council,
schools-and-childcare-uniforms, faq, uniform-custom-designs) via search-result text; goodstart., clothing.,
arcare., yha., goondee., aveo., banksyd. `.totalimagegroup.com.au` help hubs and return pages;
resthaven.asn.au/uniform/; forbes.com.au BrandVoice. Trade: help.deconetwork.com (order life cycle, artwork
approvals), printavo.com and support.printavo.com (statuses, receiving), jim2help.happen.biz (status),
ascolour.com.au / .co.nz wholesale FAQs, uniforms.com.au (embroidery, MOQ guide), melbournemerch.com.au,
oneflare.com.au, teamspiritsports.com.au, c2csport.com.au, cargocrew.com.au, ato.gov.au (tax invoices),
arpansa.gov.au (UPF), kinggee.com (hi-vis). Programs: upperlachlan.nsw.gov.au, waroona.wa.gov.au,
menzies.wa.gov.au, bulloo.qld.gov.au, cottesloe.wa.gov.au and btrc.qld.gov.au uniform policies; seslhd.health.nsw.gov.au,
hsu.asn.au (NSW Health TAMS), health.nsw.gov.au PD2019_012; uniformmarket.com, sprintlaw.com.au,
getworkgear.com, arrowuniforms.co.nz; australiantenders.com.au; defence.gov.au; industry.gov.au.
