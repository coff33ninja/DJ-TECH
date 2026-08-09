\# Build a PC Repair Job Card, Inventory \& Invoicing System



Create a complete, modern web application for my independent computer repair and technology business:



\*\*Business name:\*\* DJ Tech

\*\*Slogan:\*\* \*Fixing your problems, one service at a time.\*



The application should be designed as a practical system I can actually use to run a small PC repair business, not merely as a UI mockup.



The primary purpose is to manage:



\* Customers

\* Devices

\* Repair job cards

\* Diagnostics

\* Parts and stock

\* Supplier purchases

\* Online product links

\* Parts assigned to specific customers/jobs

\* Labour

\* Quotes

\* Invoices

\* Payments

\* Job status

\* Repair history

\* Warranty information

\* Profit and cost tracking



Build the system with a clean, professional technology-repair aesthetic. It should feel modern and trustworthy without looking like generic corporate accounting software.



\---



\## 1. Dashboard



Create a useful dashboard showing:



\* Open jobs

\* Jobs awaiting diagnosis

\* Jobs awaiting customer approval

\* Jobs waiting for parts

\* Jobs currently being repaired

\* Jobs ready for collection

\* Completed jobs

\* Outstanding invoices

\* Unpaid invoices

\* Today's appointments

\* Recent customers

\* Recent purchases

\* Current stock alerts

\* Low-stock items

\* Monthly revenue

\* Monthly expenses

\* Estimated profit



Use cards, tables and simple charts where appropriate.



\---



\# 2. Customer Management



Create a customer database.



Each customer should have:



\* Customer ID

\* Full name

\* Company name if applicable

\* Phone number

\* Email

\* Address

\* Notes

\* Date created

\* Customer status



A customer can own multiple devices and have multiple historical jobs.



Show a customer profile containing:



\### Customer overview



\* Contact details

\* Devices

\* Active jobs

\* Completed jobs

\* Quotes

\* Invoices

\* Payments

\* Purchase history

\* Repair history

\* Notes



Allow searching and filtering customers.



\---



\# 3. Device Management



Each customer can have multiple devices.



Record:



\* Device ID

\* Customer

\* Device type

\* Manufacturer

\* Model

\* Serial number

\* Asset/tag number

\* CPU

\* RAM

\* Storage

\* GPU

\* Operating system

\* Accessories received

\* Physical condition

\* Existing damage

\* Password/PIN field where appropriate, with secure handling

\* Customer's description of the problem

\* Technician notes



Allow photographs of the device to be attached to the device/job record.



Important:



Create a \*\*check-in condition report\*\*.



When a device arrives, I should be able to record things like:



\* Scratches

\* Cracked screen

\* Missing screws

\* Damaged ports

\* Missing accessories

\* Existing cosmetic damage

\* Signs of liquid damage

\* Other relevant observations



This should protect both the customer and DJ Tech by creating a record of the device's condition when it arrived.



\---



\# 4. Repair Job Cards



Create a proper repair ticket/job-card system.



Each job should have:



\* Unique job number

\* Customer

\* Device

\* Date received

\* Expected completion date

\* Technician

\* Priority

\* Current status

\* Customer-reported problem

\* Initial diagnosis

\* Detailed technician notes

\* Work performed

\* Parts used

\* Labour

\* Additional charges

\* Customer approvals

\* Attachments/photos

\* Internal notes

\* Customer-visible notes

\* Warranty period

\* Completion date

\* Collection date



Job statuses should include:



\*\*Received → Diagnosing → Awaiting Approval → Awaiting Parts → Repairing → Testing → Ready for Collection → Collected → Completed\*\*



Also support:



\* Cancelled

\* Unrepairable

\* Customer Declined Repair

\* Awaiting Customer

\* Warranty Return



Make the workflow visually obvious.



\---



\# 5. Job Timeline



Every job should have a chronological activity timeline.



Example:



08 Aug 2026 09:14

Device received.



08 Aug 2026 10:02

Diagnosis started.



08 Aug 2026 11:30

Fault identified: failed SSD.



08 Aug 2026 12:00

Replacement SSD quotation sent.



08 Aug 2026 13:10

Customer approved repair.



09 Aug 2026 09:20

Replacement SSD purchased.



10 Aug 2026 14:30

SSD installed.



10 Aug 2026 15:20

System testing completed.



10 Aug 2026 16:00

Customer notified.



This should make the entire history of a repair easy to understand.



\---



\# 6. Parts \& Inventory



Create inventory management.



Each inventory item should have:



\* Part number

\* SKU

\* Product name

\* Category

\* Manufacturer

\* Model

\* Description

\* Serial number where applicable

\* Quantity

\* Minimum stock level

\* Purchase price

\* Selling price

\* Markup

\* Supplier

\* Supplier product URL

\* Date purchased

\* Warranty

\* Storage location

\* Notes



Examples:



\* SSD

\* HDD

\* RAM

\* PSU

\* GPU

\* CPU

\* Motherboard

\* Laptop battery

\* Laptop screen

\* Keyboard

\* Mouse

\* Thermal paste

\* Thermal pads

\* Cables

\* Adapters

\* Fans

\* Cleaning supplies

\* Miscellaneous components



Support stock movements:



\* Purchased

\* Reserved

\* Assigned to job

\* Installed

\* Returned

\* Damaged

\* Sold

\* Adjusted



\---



\# 7. Online Product Link Import



This is a major feature.



I want to be able to paste a product URL from an online supplier into the system.



For example:



\* Takealot

\* Other South African online stores

\* Supplier websites

\* Hardware stores

\* Any compatible product page



The system should attempt to retrieve product information from the URL.



Extract where technically and legally possible:



\* Product name

\* Product image

\* Manufacturer

\* Model

\* SKU

\* Supplier

\* Current price

\* Availability

\* Product description

\* Product URL

\* Estimated delivery information

\* Product rating if available

\* Product identifiers



Do NOT assume every website has the same HTML structure.



Create a flexible adapter/crawler architecture so additional websites can be supported later.



If a site cannot be crawled or blocks automated access, gracefully fall back to manual entry rather than breaking the application.



Clearly separate:



\*\*Supplier cost\*\*



from



\*\*DJ Tech selling price\*\*



The system should never accidentally expose my supplier cost to a customer.



\---



\# 8. ETA / Delivery Tracking



When a product is ordered for a customer's repair:



Store:



\* Supplier

\* Order number

\* Product

\* Quantity

\* Purchase price

\* Order date

\* Expected delivery date

\* Actual delivery date

\* Delivery status

\* Tracking number

\* Tracking URL

\* Customer/job associated with the purchase



Statuses:



\*\*Planned → Ordered → Processing → Shipped → Out for Delivery → Delivered → Returned/Cancelled\*\*



Allow the job status to automatically indicate:



\*\*Waiting for parts\*\*



when a required part has been ordered but not yet received.



If an ETA changes, record the change in the job timeline.



\---



\# 9. Client-Specific Purchases



This is extremely important.



I want every purchase made specifically for a customer to be traceable.



Example:



Customer:

John Smith



Job:

DJ-2026-0042



Required part:

1TB NVMe SSD



Supplier:

Takealot



Supplier price:

R1,199



Purchase date:

08/08/2026



ETA:

11/08/2026



Selling price:

R1,499



Then the system should know:



\*\*This specific purchase belongs to this specific customer and repair job.\*\*



Allow me to attach supplier invoices/receipts to the purchase record.



\---



\# 10. Quotes



Create a professional quote generator.



Quotes should contain:



DJ Tech branding

Business details

Customer details

Job number

Device information

Description of work

Parts

Labour

Other charges

Subtotal

Discount

VAT if applicable/configured

Total

Quote validity

Terms and conditions



Allow:



\* Save

\* Edit

\* Duplicate

\* Convert quote to job

\* Convert approved quote into invoice

\* Export PDF

\* Print

\* Share



Quote statuses:



\* Draft

\* Sent

\* Awaiting Approval

\* Approved

\* Declined

\* Expired

\* Converted



\---



\# 11. Customer Approval



Customers should be able to approve or decline a quote.



Record:



\* Approval date

\* Customer

\* Quote

\* Approved amount

\* Optional customer comment



Ideally provide a simple customer-facing approval page that does not require the customer to create a full account.



\---



\# 12. Invoicing



Create professional invoices.



Invoice information:



\* Invoice number

\* Customer

\* Job number

\* Device

\* Parts

\* Labour

\* Other charges

\* Discounts

\* VAT if configured

\* Total

\* Amount paid

\* Balance due

\* Payment status

\* Due date



Statuses:



\*\*Draft → Sent → Partially Paid → Paid → Overdue → Cancelled\*\*



Generate printable/PDF invoices.



Keep invoice numbering configurable and sequential.



\---



\# 13. Payments



Record:



\* Payment date

\* Amount

\* Payment method

\* Reference

\* Invoice

\* Customer

\* Notes



Payment methods:



\* Cash

\* EFT

\* Card

\* Other



Allow partial payments.



Automatically calculate:



\*\*Invoice total - payments = outstanding balance\*\*



\---



\# 14. Profit \& Cost Tracking



I want to know whether I actually made money on each repair.



For every job calculate:



\*\*Parts cost\*\*



\*\*Parts selling price\*\*



\*\*Labour\*\*



\*\*Other costs\*\*



\*\*Total customer charge\*\*



\*\*Gross profit\*\*



\*\*Profit margin\*\*



Example:



SSD cost: R1,199

SSD sold for: R1,499

Labour: R450



Customer total: R1,949



Gross profit should account for the actual part cost rather than simply treating the entire invoice as profit.



\---



\# 15. Warranty Tracking



Every repair can have a configurable warranty period.



Record:



\* Warranty duration

\* Warranty start

\* Warranty expiration

\* Parts warranty

\* Labour warranty

\* Supplier warranty

\* Warranty notes



Show a warning when a customer returns with a device that may still be under warranty.



Allow warranty returns to be linked to the original job.



\---



\# 16. Documents \& Attachments



Allow attachments to customers, devices, jobs and purchases.



Examples:



\* Device photographs

\* Supplier invoices

\* Customer documents

\* Diagnostic reports

\* Screenshots

\* Quotes

\* Invoices

\* Warranty documents

\* Receipts



Organise them logically.



\---



\# 17. Search



Create global search.



Search by:



\* Customer name

\* Phone

\* Email

\* Job number

\* Device serial number

\* Device model

\* Invoice number

\* Quote number

\* Part number

\* Supplier order number



Searching for a serial number should ideally reveal the entire repair history of that device.



\---



\# 18. Reporting



Create reports for:



\* Revenue

\* Expenses

\* Profit

\* Outstanding invoices

\* Jobs completed

\* Jobs awaiting parts

\* Most common repairs

\* Parts purchased

\* Parts consumed

\* Supplier spending

\* Customer spending

\* Warranty returns

\* Monthly revenue

\* Monthly profit



Allow date filtering and export where appropriate.



\---



\# 19. Business Settings



Create settings for:



\* DJ Tech business information

\* Logo

\* Contact details

\* Address

\* Email

\* Phone

\* Banking details

\* Invoice settings

\* Quote settings

\* VAT configuration

\* Default labour rate

\* Default markup

\* Warranty defaults

\* Currency



Currency should default to:



\*\*ZAR / R\*\*



\---



\# 20. Privacy \& Security



This system contains customer information and potentially sensitive device information.



Implement:



\* Authentication

\* Secure password storage

\* Session management

\* Role-based permissions

\* Admin account

\* Technician accounts

\* Customer-facing pages separate from internal administration

\* Audit logging

\* Database backups

\* Secure handling of uploaded files



Never expose supplier costs, internal notes or profit calculations on customer-facing pages.



\---



\# 21. Audit Log



Record important actions:



\* Customer created

\* Job created

\* Job edited

\* Quote created

\* Quote approved

\* Part purchased

\* Part assigned

\* Invoice created

\* Payment recorded

\* Status changed

\* User changed

\* Data deleted



Include:



\* Timestamp

\* User

\* Action

\* Affected record



\---



\# 22. UI / UX



Make the application extremely easy to use while working on a repair.



I should be able to go from:



\*\*Customer → Device → Job → Diagnosis → Quote → Approval → Parts → Repair → Testing → Invoice → Payment → Collection\*\*



without hunting through menus.



Use:



\* Responsive layout

\* Desktop-first administration interface

\* Mobile-friendly job cards

\* Clear status badges

\* Search everywhere

\* Quick actions

\* Keyboard-friendly forms

\* Confirmation dialogs for destructive actions

\* Toast notifications

\* Timeline views

\* Professional PDF documents



Create a polished dashboard rather than a generic template.



\---



\# 23. Suggested Navigation



Use something similar to:



\*\*Dashboard\*\*



\*\*Customers\*\*



\*\*Devices\*\*



\*\*Jobs\*\*



\*\*Quotes\*\*



\*\*Invoices\*\*



\*\*Payments\*\*



\*\*Inventory\*\*



\*\*Purchases\*\*



\*\*Suppliers\*\*



\*\*Reports\*\*



\*\*Documents\*\*



\*\*Settings\*\*



\---



\# 24. Technical Architecture



Build the application so it can eventually be deployed to my own server.



Prioritise:



\* Modular architecture

\* API-driven design

\* Proper database relationships

\* Validation

\* Error handling

\* Logging

\* Backups

\* Environment configuration

\* Docker compatibility



Do not hard-code supplier integrations directly into the UI.



Create a supplier integration layer so I can add additional stores later.



For example:



SupplierAdapter



\* TakealotAdapter

\* SupplierWebsiteAdapter

\* GenericURLAdapter



The crawler/import system should have strict timeouts, rate limits, caching and error handling.



Do not bypass authentication, CAPTCHAs, access controls or other anti-bot protections.



\---



\# 25. Important Database Relationships



Design the database around these relationships:



Customer

→ has many Devices



Device

→ has many Jobs



Job

→ has many JobItems



Job

→ has many Parts



Job

→ has many LabourEntries



Job

→ has Quotes



Quote

→ can become Invoice



Invoice

→ has many Payments



Purchase

→ belongs to Supplier



Purchase

→ contains Parts



Purchase

→ can be associated with Customer/Job



Part

→ exists in Inventory



Part

→ can be assigned to a Job



Job

→ has TimelineEvents



All financial calculations should be traceable back to their underlying records.



\---



\# 26. Future AI Integration



Design the application with a future AI API in mind.



Eventually I want AI to be able to help with:



\* Reading customer descriptions

\* Suggesting diagnostic steps

\* Summarising repair history

\* Generating customer-friendly explanations

\* Drafting quotes

\* Identifying possible parts

\* Reading product links

\* Comparing supplier prices

\* Detecting duplicate customers

\* Summarising job notes

\* Generating invoices

\* Searching the repair database using natural language



For example:



> "Show me all jobs where customers had SSD failures during the last six months."



or:



> "Which supplier currently has the cheapest compatible 1TB NVMe drive?"



or:



> "Summarise everything we've done on John's PC."



Build the backend so this can be added without rewriting the entire application.



\---



\# 27. Seed Data / Demo Mode



Create realistic demonstration data for:



\* Several customers

\* Multiple devices

\* Several repair jobs

\* Parts

\* Purchases

\* Suppliers

\* Quotes

\* Invoices

\* Payments



Make the demo immediately show how the complete workflow operates.



\---



\# 28. Branding



Brand the entire application as:



\# DJ Tech



\*\*Fixing your problems, one service at a time.\*\*



Visual identity should communicate:



\* Computer repair

\* Technical expertise

\* Reliability

\* Modern technology

\* Friendly local service



Avoid making it look like a giant enterprise ERP system.



It should feel like a \*\*professional independent technician's workshop that happens to have extremely good software behind it.\*\*



\---



\# Final Requirement



Do not stop at generating a static mockup.



Build the application as a functional prototype with:



\* Working database

\* Working CRUD operations

\* Working customer/device/job relationships

\* Working inventory

\* Working purchase tracking

\* Working quote generation

\* Working invoice generation

\* Working payment tracking

\* Working PDF/print functionality

\* Working search

\* Working job timeline

\* Working authentication

\* Working audit logging

\* Modular supplier URL ingestion architecture



Where an external service such as a supplier crawler cannot be fully implemented in the prototype, create a clean interface/adapter and mock implementation so the real integration can be added later.



Prioritise a working end-to-end repair workflow over decorative features.



The first thing I should be able to demonstrate is:



\*\*Create customer → add PC → create repair job → diagnose → add required part → paste supplier URL → record purchase → track ETA → receive part → assign part to job → complete repair → generate invoice → record payment → close job.\*\*



That entire journey should work smoothly.



