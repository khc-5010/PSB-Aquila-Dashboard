# Plastics Manufacturing Ontology — v1
## PSB–Aquila Industrial AI Alliance

**Version:** 1.0 — April 2026
**Purpose:** Structured reference taxonomy for the alliance's knowledge graph
**Status:** Draft for review by Duane Clement, Brett Hyder, and Kyle Campbell
**Next step:** Review → refine → encode into Neon PostgreSQL ontology tables in the dashboard

---

## Section 1: Ontology Overview

### What this document is

This is a structured map of the plastics manufacturing domain as seen through the alliance's prospect research. It defines the **types of things** that exist in this world (entity classes), the **specific things** we've found (instances), and **how they connect** (relationships). Think of it as the vocabulary and grammar that will let the alliance's knowledge graph speak the language of plastics manufacturing.

Every time the alliance engages a new client, the team will add nodes (new companies, technologies, certifications, people) and edges (Company X uses Technology Y, Company Z holds Certification W) to this graph. After 20 clients, the graph doesn't just describe 20 companies — it reveals patterns: which technologies cluster together, which certifications predict which market verticals, which companies share suppliers, which skill gaps are universal. That compounding intelligence is what separates the alliance from any generic AI vendor.

### Core concepts (for non-technical readers)

**Class (Entity Type):** A category of thing. "Certification" is a class. ISO 13485 is a specific instance of that class. Classes can have subclasses — "Medical Device QMS" is a subclass of "Certification."

**Instance:** A specific thing. "RJG CoPilot" is an instance of the class "Technology." "Accudyn Products" is an instance of the class "Company."

**Relationship (Edge):** A named connection between two instances. "Accudyn Products → uses_technology → Moldflow Insight Premium" is a relationship. Relationships have a direction — the subject, the verb, and the object.

**Attribute:** A property of an instance. "Founded: 1997" is an attribute of Accudyn Products. "Type: Cavity Pressure Monitoring" is an attribute of RJG CoPilot.

### How this connects to the dashboard

The dashboard's Neon PostgreSQL database will store ontology data in dedicated tables alongside prospect data. Two layers feed the ontology:

- **Layer 1 (Auto-derived):** When a prospect record is created or updated, structured fields (certifications held, processes operated, markets served) automatically generate ontology nodes and edges. Zero manual effort after initial data entry.
- **Layer 2 (Research-extracted):** When a deep research brief is saved, specific technology mentions, equipment brands, quality methods, and supplier relationships are extracted and added. This captures the richer, narrative-level intelligence that structured fields miss.

The interactive US map will use ontology density per state as one of its heat map metrics — more nodes and edges in a state means richer intelligence coverage.

---

## Section 2: Entity Type Taxonomy (Classes)

Each class below includes its definition, position in the hierarchy, key attributes, and where in the prospect data it surfaces.

---

### 2.1 Company

**Definition:** An organization that manufactures plastic parts, builds molds/tooling, or provides technology/services to the plastics manufacturing industry.

**Key attributes:** Name, Target Entity name, Legacy/AKA names, Website, Location (city, state, country), Employee count, Year founded, Revenue estimate, Category (see subtypes), Tooling control (In-house / Outsources / Unknown), Decision location (if different from operations)

**Source:** Every prospect record in the pipeline. The prospecting prompt defines the primary categories.

**Subtypes:**

| Subtype | Definition | Example |
|---------|-----------|---------|
| Converter | Company in the business of molding plastic parts for customers | GeorgeKo Industries |
| Converter + In-House Tooling | Converter that also designs/builds its own molds | Accudyn Products, C&J Industries |
| Mold Maker | Company that designs and builds injection molds and tooling | Reddog Industries |
| Mold Maker + Converter | Tool shop that also runs production molding | Suburban Tool & Die |
| Captive OEM Converter | OEM that molds in-house for its own products, not as a service | Truck-Lite / Clarience |
| Knowledge Sector | Technology/training provider to the injection molding industry | RJG Inc., Beaumont Technologies |
| Catalog / Standards | Supplier of standardized mold components and bases | DME Company, HASCO |
| Hot Runner Systems | Manufacturer of hot runner systems for injection molds | Husky Technologies, Mold-Masters |
| Strategic Partner | Designated founding partner (not a client target) | Beaumont Technologies |
| Conglomerate Division | Plastics-relevant operating unit within a diversified parent | FOBOHA (Barnes Group) |

---

### 2.2 Manufacturing Process

**Definition:** A method by which raw plastic material is transformed into a finished or semi-finished part.

**Parent class:** None (top-level)

**Key attributes:** Process name, Material compatibility, Typical equipment, Data generated, Monitoring applicability

**Source:** Company profiles across all state reports — "What they do" fields. The prospecting prompt identifies injection molding as the primary target process.

**Subtypes (hierarchy):**

| Process | Parent | Definition | Notes |
|---------|--------|-----------|-------|
| Injection Molding | — | Forcing molten plastic into a closed mold cavity under pressure | Primary alliance target process |
| Multi-Shot / Two-Shot Injection | Injection Molding | Sequential injection of two or more materials in one cycle | Tessy, American Tool & Mold |
| Insert Molding | Injection Molding | Molding plastic around a pre-placed component (metal, etc.) | Ironwood Plastics specialty |
| Overmolding | Injection Molding | Molding one material over another already-formed part | Common in medical, automotive |
| Gas-Assist Injection | Injection Molding | Injecting nitrogen gas to hollow out thick sections | Anderson Technologies |
| Micro Molding | Injection Molding | Molding very small parts (sub-gram) | MHS/Mold Hotrunner Solutions |
| LSR Injection Molding | Injection Molding | Injection molding of Liquid Silicone Rubber (cold-deck tooling) | SIMTEC, Roembke |
| In-Mold Labeling (IML) | Injection Molding | Placing pre-printed label in mold before injection | TH Plastics specialty |
| Structural Foam Molding | Injection Molding | Low-pressure process using foaming agent for large parts | Port Erie Plastics |
| Blow Molding | — | Inflating a heated parison/preform inside a mold | Currier Plastics |
| Injection Stretch Blow Molding (ISBM) | Blow Molding | Two-stage: injection preform then stretch-blow to shape | Currier Plastics |
| Extrusion Blow Molding (EBM) | Blow Molding | Continuous extrusion of parison then blow | Currier Plastics |
| Extrusion | — | Forcing plastic through a die to create continuous profiles | PEX tubing (Port Erie), pipe |
| Thermoforming | — | Heating sheet plastic and forming over/into a mold | Munot Plastics |
| Compression Molding | — | Placing charge in open mold and closing under pressure | Haysite (thermoset composites) |
| Pultrusion | — | Pulling fibers through resin bath and heated die | Haysite |
| Vinyl Dip Molding | — | Dipping heated form into liquid vinyl/plastisol | Caplugs Erie facility |

---

### 2.3 Equipment

**Definition:** Physical machinery, instrumentation, or automation hardware used in plastics manufacturing operations.

**Parent class:** None (top-level)

**Key attributes:** Brand/manufacturer, Model/series, Type (see subtypes), Tonnage range (for presses), Capabilities

**Source:** Company profiles — "What they do" and technology signals sections across all reports.

**Subtypes (hierarchy):**

| Subtype | Parent | Definition |
|---------|--------|-----------|
| Injection Molding Machine | — | Press that performs injection molding cycles |
| All-Electric Press | Injection Molding Machine | Servo-driven press with no hydraulics (cleaner data signal) |
| Hydraulic Press | Injection Molding Machine | Traditional hydraulically-driven press |
| Vertical Press | Injection Molding Machine | Press with vertical clamp for insert/overmolding |
| Blow Molding Machine | — | Press for blow molding processes |
| Extrusion Line | — | Equipment for continuous extrusion of profiles/sheet |
| CNC Machining Center | — | Computer-controlled milling/turning for mold components |
| 5-Axis CNC | CNC Machining Center | Five-axis machining for complex mold geometries |
| EDM (Electrical Discharge Machine) | — | Wire or sinker EDM for mold cavities/electrodes |
| Robotic EDM Cell | EDM | EDM with robotic electrode/workpiece handling |
| 3D Printer / Additive Manufacturing | — | Equipment for prototyping or conformal cooling inserts |
| Robot / Cobot | — | Industrial robot or collaborative robot for part handling |
| 6-Axis Robot | Robot / Cobot | Full articulated industrial robot |
| Autonomous Mobile Robot (AMR) | Robot / Cobot | Self-navigating mobile platform for material transport |
| CMM (Coordinate Measuring Machine) | — | Metrology equipment for dimensional inspection |
| CT Scanner (Industrial) | — | X-ray computed tomography for part/mold inspection |
| Vision System | — | Camera-based inspection system (2D or 3D) |
| Laser Welder | — | Laser welding for mold repair |
| Ultrasonic Welder | — | Assembly equipment for joining plastic components |
| Cleanroom | — | Controlled environment for medical/sensitive production |
| Hot Runner System | — | Heated manifold/nozzle system keeping plastic molten in mold |
| Mold Temperature Controller | — | Device regulating mold temperature during production |
| Material Handling System | — | Dryers, loaders, blenders, conveyors for resin management |

**Equipment Brands** (separate from equipment types — these are manufacturer entities):

Documented brands from the research reports include: Arburg, ENGEL, Nissei, Sumitomo (SHI), Cincinnati Milacron, Toshiba, Husky (HyPET, HyCAP), JSW, Wittmann, KraussMaffei, Mantle, Yasda, Roku-Roku, Mitsubishi (EDM), Mitutoyo (CMM), Zeiss (CT), Conair (material handling), Markforged (3D printing), System 3R (automation/tooling), STÄUBLI (robotics).

---

### 2.4 Technology / Software

**Definition:** A software platform, monitoring system, simulation tool, or digital capability used in plastics manufacturing operations or mold design.

**Key attributes:** Name, Vendor, Type (see subtypes), Data generated, Integration points

**Source:** Technology signals in company profiles; infrastructure company profiles (especially RJG, Kistler, Priamus); direct mentions in "Why they surfaced" fields.

**Subtypes:**

| Subtype | Definition | Key Instances |
|---------|-----------|---------------|
| Cavity Pressure Monitoring | Sensor + software systems measuring in-mold pressure during injection | RJG CoPilot/eDart, Kistler ComoNeo, Priamus FILLCONTROL |
| Process Monitoring / MES | Plant-floor systems tracking production metrics in real time | Shotscope, SCADA, Industry 4.0 monitoring |
| Mold Flow Simulation (CAE) | Software predicting plastic flow, cooling, warpage before cutting steel | Moldflow (Autodesk), Moldex3D, SIGMASOFT, SigmaSoft |
| CAD / Mold Design | 3D design software for parts and molds | SolidWorks, Siemens NX, CREO (Pro/E), AutoCAD, Unigraphics |
| CAM / CNC Programming | Software generating toolpaths for CNC machining of mold components | MasterCAM, PowerMill |
| ERP / MRP | Enterprise resource planning and material requirements planning | IQMS/DELMIAworks, SAP, custom-built ERP |
| AI / ML Platform | Artificial intelligence or machine learning software for manufacturing | Aquila platform, RJG MAX, Kistler ComoNeoPREDICT, Mold-Masters APS-AI |
| CPQ (Configure Price Quote) | Software for configuring and quoting complex products | Tacton (Husky) |
| Mold Monitoring / Asset Tracking | IoT devices and platforms tracking mold lifecycle and location | Progressive CVe/ProFile, HASCO Mold Track, DME SmartMold |
| Temperature Control Software | Digital control of hot runner zone temperatures | Altanium (Husky), TempMaster (Mold-Masters), SmartSeries (DME) |
| Data Platform / IoT Hub | Cloud infrastructure for collecting and storing manufacturing data | Husky Advantage+Elite (Azure), RJG The Hub |
| Statistical Software | Tools for SPC, DOE, capability analysis | PC-DMIS, Minitab (implied), various |
| Runner Balance Technology | Proprietary technology for balancing multi-cavity mold filling | Beaumont MeltFlipper |
| Virtual Molding | Advanced simulation beyond standard CAE — full 3D thermal/flow modeling | SigmaSoft Virtual Molding (F&S Tool) |

---

### 2.5 Material

**Definition:** A raw plastic resin, compound, or additive processed by a converter or specified in mold design.

**Key attributes:** Name, Type (thermoplastic/thermoset/elastomer), Grade/trade name (if specific), Processing characteristics

**Source:** Company profiles — "What they do" fields, material capability lists. Less consistently documented than other entity types.

**Subtypes:**

| Subtype | Definition |
|---------|-----------|
| Commodity Thermoplastic | High-volume, lower-cost resins (PP, PE, PS, ABS) |
| Engineering Thermoplastic | Performance resins for structural/demanding applications (PC, Nylon/PA, Acetal/POM, PBT) |
| High-Performance Thermoplastic | Premium resins for extreme conditions (PPS, PEI/Ultem, PEEK, LCP) |
| Thermoset | Resins that cure irreversibly (BMC, SMC, phenolics, polyesters) |
| Elastomer / Rubber | Flexible materials including LSR, HCR, TPE, TPR, silicone |
| Filled / Reinforced Compound | Base resin with glass fiber, carbon fiber, mineral fill, or other reinforcement |

**Specific resins documented in reports:** PP (polypropylene), PE (polyethylene), LDPE, ABS, PC (polycarbonate), Nylon/PA (polyamide), Glass-filled nylon, Acetal/POM, PPS (polyphenylene sulfide), PEI/Ultem, PBT, PVC, TPE/TPR, Crystal styrene, LSR (liquid silicone rubber), HCR (high consistency rubber), BMC/SMC (thermoset composites), Polyesters.

---

### 2.6 Certification

**Definition:** A formal accreditation, registration, or quality management system standard held by a company, demonstrating compliance with industry or regulatory requirements.

**Key attributes:** Standard name, Version/year, Issuing body, Scope, Market verticals requiring it

**Source:** Company profiles — certification lists in virtually every prospect record.

**Subtypes:**

| Subtype | Definition | Instances |
|---------|-----------|-----------|
| General QMS | Broad quality management system certification | ISO 9001 |
| Medical Device QMS | Quality system for medical device manufacturing | ISO 13485, FDA Registration, MedAccred |
| Automotive QMS | Quality system for automotive supply chain | IATF 16949 (formerly TS 16949) |
| Aerospace / Defense QMS | Quality system for aerospace and defense manufacturing | AS9100, NADCAP |
| Defense Security | Registration for handling defense/ITAR-controlled articles | ITAR Registration |
| Environmental | Environmental management system certification | ISO 14001 |
| Product Safety | Certification of product/material compliance | UL Recognition/Listing |
| Food Safety | Quality system for food-contact manufacturing | SQF (Safe Quality Food) |
| Cleanroom Classification | Controlled environment rating per ISO 14644 | ISO Class 7, ISO Class 8 |
| Specialized Accreditation | Industry-specific technical accreditation | MedAccred (plastics), BAC 5321, OSHA SHARP |
| Ownership / Diversity | Business certifications related to ownership status | WBENC (woman-owned), 8(a), HUBZone |

---

### 2.7 Market Vertical

**Definition:** An end-market industry sector served by a plastics manufacturer.

**Key attributes:** Name, Regulatory intensity (high/medium/low), Typical certifications required, Traceability requirements, Typical part complexity

**Source:** Company profiles — industries served. The prospecting prompt identifies medical and automotive as the strongest traceability/regulatory drivers.

**Instances:**

| Market Vertical | Regulatory Intensity | Key Certifications | Notes |
|----------------|---------------------|-------------------|-------|
| Medical Devices | High | ISO 13485, FDA, MedAccred | Strongest alliance value — traceability, validation, documentation demands |
| Pharmaceutical / Drug Delivery | High | ISO 13485, FDA, cGMP | Overlaps medical; drug delivery devices are a growth segment |
| Automotive | High | IATF 16949 | APQP/PPAP requirements create structured data environments |
| Aerospace | High | AS9100, NADCAP | Extreme traceability and material certification requirements |
| Defense / Military | High | ITAR, AS9100 | Security clearance adds complexity; long product lifecycles |
| Packaging / Closures | Medium | SQF (food), FDA (food-contact) | High-volume, high-cavitation — process optimization ROI is large |
| Electronics / Electrical | Medium | UL | Precision requirements, ESD considerations |
| Consumer Products | Low | UL (some) | High product mix, shorter lifecycles, cost-driven |
| Industrial / MRO | Low | Varies | Maintenance, repair, and operations parts |
| Appliance | Medium | UL | Large parts, decorative requirements (IML) |
| Energy / Oil & Gas | Medium | API (some) | Harsh environment requirements |
| Telecommunications | Low-Medium | Varies | Connector housings, enclosures |

---

### 2.8 Quality Method

**Definition:** A systematic methodology, technique, or practice used to control, monitor, or improve manufacturing quality and process consistency.

**Key attributes:** Name, Type (see subtypes), Data generated, Technology prerequisites, Industry adoption level

**Source:** Technology signals in company profiles; RJG infrastructure profile; the prospecting prompt's readiness signals.

**Subtypes and instances:**

| Method | Type | Definition | Data Generated |
|--------|------|-----------|---------------|
| Scientific Molding | Process Control Philosophy | Data-driven approach to setting and validating injection molding parameters based on material behavior, not trial-and-error | Viscosity curves, pressure profiles, process windows |
| Decoupled Molding (DI/DII/DIII) | Process Control Method | RJG's staged approach separating fill, pack, and hold phases using cavity pressure feedback | Fill-time curves, transfer position data, cavity pressure profiles |
| DOE (Design of Experiments) | Statistical Method | Structured experimentation to identify optimal process parameters | Factor/response matrices, main effects, interaction plots |
| SPC (Statistical Process Control) | Monitoring Method | Real-time tracking of process/part dimensions against control limits | Control charts, Cpk/Ppk values, trend data |
| Cavity Pressure Monitoring | In-Process Monitoring | Real-time measurement of plastic pressure inside the mold cavity during each shot | Pressure curves per cavity per shot (high-frequency time series) |
| APQP / PPAP | Automotive Quality Planning | Structured product/process approval workflow required by automotive OEMs | Control plans, process flow diagrams, FMEA, dimensional results |
| FMEA (Failure Mode & Effects Analysis) | Risk Analysis | Systematic identification and ranking of potential failure modes | RPN scores, action item lists |
| IQ/OQ/PQ Validation | Medical/Pharma Validation | Installation, Operational, and Performance Qualification of equipment and processes | Validation protocols and reports |
| TZERO Optimization | Art-to-Part Method | RJG's methodology for achieving production-ready tooling on first article | Process templates, optimization records |
| QRM (Quick Response Manufacturing) | Lean Method | Lead-time reduction methodology for high-mix environments | Lead time metrics, queue data |
| Lean / Six Sigma | Continuous Improvement | Waste elimination and variation reduction methodologies | Value stream maps, DMAIC project records |
| SMED (Single Minute Exchange of Die) | Changeover Method | Rapid mold changeover methodology | Changeover time records |

---

### 2.9 Ownership Structure

**Definition:** The governance and capital structure of a manufacturing company, which significantly affects decision-making speed, investment appetite, and engagement approach.

**Key attributes:** Type, Owner/parent name, Acquisition date (if applicable), Consolidation vs. conglomerate pattern, Decision location

**Source:** Company profiles — ownership sections. The prospecting prompt defines PE acquisition within 6 months as a highest-urgency engagement window.

**Instances:**

| Structure Type | Definition | Engagement Implications | Examples |
|---------------|-----------|------------------------|----------|
| Family / Founder Owned | Controlled by founding family or individual | Fastest decision-making, personal relationships matter, succession risk | Accudyn (Bly family), GeorgeKo (Koket family), Anderson Technologies (Anderson family, 3rd gen) |
| ESOP (Employee-Owned) | Employee Stock Ownership Plan | Investment-oriented once value is demonstrated; collective decision-making | C&J Industries, Crescent Industries, American Plastic Molding |
| PE-Backed | Private equity firm is majority owner | ROI-driven, 3-5 year hold period, aggressive optimization mandate | Caplugs (ShoreView), Currier (Sheridan Capital), SyBridge (Crestview) |
| PE Platform / Roll-Up | PE-backed company actively acquiring and integrating others | Data integration challenges across acquisitions = alliance sweet spot | Adler Industrial, SyBridge Technologies, Seaway Plastics |
| Corporate Subsidiary | Owned by a larger operating company | Decisions may flow through parent; local champions needed | Essentra Components (Essentra plc), PRISM/TTMP (Marmon/Berkshire Hathaway) |
| Conglomerate Division | Operating unit within diversified holding company | Cross-pollination potential; corporate digital mandates may help | FOBOHA (Barnes), DME/Mold-Masters (Hillenbrand) |
| Public Company | Traded on public stock exchange | Longer decision cycles, procurement processes | Hillenbrand (NYSE: HI), Husky/GPGI (NYSE: GPGI) |

---

### 2.10 Workforce Capability

**Definition:** A documented skill, credential, or training program that indicates the technical sophistication of a company's workforce.

**Key attributes:** Credential name, Issuing organization, Level (if tiered), Relevance to data generation

**Source:** Company profiles — technology and PSB connection sections. RJG infrastructure profile.

**Instances:**

| Capability | Issuer | Levels | Significance |
|-----------|--------|--------|-------------|
| RJG Master Molder Certification | RJG Inc. | I, II, III | Industry gold standard for scientific molding. Indicates data-driven process culture |
| Certified SolidWorks Professional (CSWP) | Dassault Systèmes | Single + specialist | CAD proficiency relevant to mold design data quality |
| Journeyman Toolmaker | State apprenticeship boards | Single (completion) | Indicates deep institutional toolmaking knowledge |
| Apprenticeship Program | Company-internal / State-registered | Varies | Knowledge transfer pipeline; signals workforce investment |
| Plastics Engineering Technology Degree (PLET) | Penn State Behrend, other accredited programs | AAS, BS | Domain-specific formal education |
| Lean / Six Sigma Belt | ASQ, various | Green, Black, Master Black | Continuous improvement capability |
| ProMolder Certification | Paulson Training | Single | Alternative to Master Molder; broader scope, less depth |

---

### 2.11 Data Type

**Definition:** A category of data generated by plastics manufacturing operations that has potential value for AI/ML applications.

**Key attributes:** Name, Source (process/equipment/software), Format, Volume, Structure level (structured/semi-structured/unstructured), AI applicability

**Source:** Inferred from technology signals, equipment mentions, and the infrastructure company profiles (especially RJG data profile and Husky data profile).

**Instances:**

| Data Type | Source | Structure | AI Applicability |
|-----------|--------|-----------|-----------------|
| Cavity Pressure Curves | In-mold sensors (RJG, Kistler, Priamus) | Highly structured (time series) | Anomaly detection, quality prediction, process optimization |
| Process Parameters | Machine controllers, MES | Structured (tabular) | Parameter optimization, predictive quality |
| Mold Design Files (CAD) | SolidWorks, NX, CREO, AutoCAD | Semi-structured (3D geometry + metadata) | Similarity search, design-for-manufacturability, automated quoting |
| Mold Flow Simulation Results | Moldflow, Moldex3D, SIGMASOFT | Semi-structured (3D fields + reports) | Correlation with actual process data, virtual DOE |
| SPC / Quality Records | Quality systems, inspection equipment | Structured (measurements + control charts) | Trend analysis, predictive quality, early warning |
| Tool/Mold History Records | Maintenance logs, cycle counters | Semi-structured to unstructured | Predictive maintenance, tool life optimization |
| ERP/MRP Transaction Data | IQMS, SAP, custom ERP | Structured (relational DB) | Production scheduling optimization, demand forecasting |
| Quoting / Estimating Records | Spreadsheets, CPQ systems, tribal knowledge | Unstructured to semi-structured | Automated quoting, cost estimation, similarity matching |
| Material Characterization Data | Lab testing, material databases | Structured (properties tables) | Material selection AI, processing parameter prediction |
| Component Catalog Data (Parametric) | DME, HASCO, Meusburger libraries | Highly structured (parametric 3D models) | Automated mold design, component recommendation |
| Hot Runner Design Data | Husky, Mold-Masters, INCOE | Semi-structured (thermal/flow models) | Design optimization, similarity search |
| Mold Monitoring / IoT Data | Progressive CVe/ProFile, HASCO sensors | Structured (time series) | Predictive maintenance, utilization optimization |
| Training / Certification Records | RJG, Paulson, company HR | Semi-structured | Workforce capability mapping, training needs analysis |
| Image / Vision Data | In-line cameras, CT scanners | Unstructured (images/3D scans) | Defect detection, dimensional verification |

---

### 2.12 Readiness Signal

**Definition:** An observable indicator that a company is likely to benefit from and be receptive to alliance engagement. Not a permanent attribute — signals are time-sensitive.

**Key attributes:** Signal type, Time sensitivity, Strength (highest-value vs. standard), Detection method

**Source:** The prospecting prompt's "Readiness Signals" section; observed across all state research reports.

This is a meta-class — it describes the alliance's assessment framework rather than a physical entity. It belongs in the ontology because it defines how companies are scored and connected to engagement opportunities.

| Signal | Strength | Time Sensitivity | Data Source |
|--------|----------|-----------------|-------------|
| RJG / cavity pressure monitoring without AI | Highest | Low (persistent condition) | Company website, LinkedIn, CWP database |
| Legacy mold library scale (30+ years, high SKU count) | Highest | Low | Company profile, founding year |
| Retiring expertise / founder succession | Highest | High (12-24 month window) | Leadership announcements, obituaries, LinkedIn |
| In-house tooling + molding combination | Highest | Low | Company profile |
| Medical device manufacturing | Highest | Low | Certification lists, FDA registration |
| PE acquisition (within 6 months) | Highest | Very high (6-month window) | M&A news, PE firm announcements |
| Moldflow / CAE software usage | High | Low | Company website, job postings |
| Technology investment history | High | Medium | Expansion news, press releases |
| ERP/MES implementation | Standard | Medium (6-12 months post-go-live) | Job postings, vendor case studies |
| Facility expansion | Standard | Medium | Local news, PIDA/state grants |
| Leadership change (COO, VP Ops, CDO) | Standard | High (6-12 month window) | LinkedIn, press releases |
| Digital transformation announcements | Standard | Medium | Press releases, conference presentations |
| Industry engagement (SPE speaker, award winner) | Standard | Low | Conference programs, trade publications |

---

## Section 3: Relationship Type Vocabulary

Each relationship below defines how entity instances connect. Direction matters — the subject (domain) performs/has/holds the relationship to the object (range).

---

### Company → Process/Technology/Certification Relationships

| Relationship | Domain | Range | Definition | Inverse | Example |
|-------------|--------|-------|-----------|---------|---------|
| operates_process | Company | Manufacturing Process | Company performs this manufacturing process | is_operated_by | Accudyn Products → operates_process → Injection Molding |
| uses_technology | Company | Technology/Software | Company has this technology deployed in operations | is_used_by | Fabrik Molded Plastics → uses_technology → RJG eDart |
| uses_equipment_brand | Company | Equipment Brand | Company operates machines from this manufacturer | equips | PRISM/TTMP → uses_equipment_brand → Arburg |
| holds_certification | Company | Certification | Company maintains this active certification | is_held_by | C&J Industries → holds_certification → ISO 13485 |
| serves_market | Company | Market Vertical | Company produces parts for this end-market | is_served_by | PTI Engineered Plastics → serves_market → Medical Devices |
| employs_method | Company | Quality Method | Company practices this quality methodology | is_employed_by | Ironwood Plastics → employs_method → Scientific Molding |
| processes_material | Company | Material | Company molds/extrudes this material type | is_processed_by | SIMTEC → processes_material → LSR |
| generates_data | Company | Data Type | Company's operations produce this category of data | is_generated_by | Hoffer Plastics → generates_data → SCADA/IoT Data |
| has_workforce_capability | Company | Workforce Capability | Company's employees hold this credential/skill | — | NyproMold → has_workforce_capability → Master Molder II/III |
| has_ownership_structure | Company | Ownership Structure | Company is governed by this ownership type | — | C&J Industries → has_ownership_structure → ESOP |
| has_readiness_signal | Company | Readiness Signal | Company exhibits this engagement indicator | — | Currier Plastics → has_readiness_signal → PE Acquisition (Sept 2025) |

### Company → Company Relationships

| Relationship | Domain | Range | Definition | Inverse | Example |
|-------------|--------|-------|-----------|---------|---------|
| acquired_by | Company | Company | Subject was purchased by object | acquired | X-Cell Tool → acquired_by → SyBridge Technologies |
| parent_of | Company | Company | Subject is the parent/holding company of object | subsidiary_of | Hillenbrand → parent_of → DME Company |
| subsidiary_of | Company | Company | Subject is a subsidiary/division of object | parent_of | Mold-Masters → subsidiary_of → Hillenbrand |
| sister_company_of | Company | Company | Both share the same parent company | sister_company_of | DME → sister_company_of → Mold-Masters |
| supplies_to | Company | Company | Subject provides products/services to object | is_supplied_by | RJG → supplies_to → Fabrik Molded Plastics |
| partners_with | Company | Company | Formal partnership or strategic relationship | partners_with | RJG → partners_with → Penn State Behrend |
| competes_with | Company | Company | Subject and object compete in the same market space | competes_with | RJG → competes_with → Kistler (in process monitoring) |
| legacy_name_of | Company | Company | Subject is a former name for what is now the object | currently_known_as | Alliance Plastics → legacy_name_of → Essentra Components |
| absorbed_into | Company | Company | Subject was absorbed/consolidated into object (brand gone) | absorbed | Niagara Caps & Plugs → absorbed_into → Caplugs |
| spun_off_from | Company | Company | Subject was carved out of object | — | — |

### Technology / Process / Certification Cross-Relationships

| Relationship | Domain | Range | Definition | Example |
|-------------|--------|-------|-----------|---------|
| monitors | Technology | Manufacturing Process | Technology monitors/controls this process | RJG CoPilot → monitors → Injection Molding |
| requires_certification | Market Vertical | Certification | This market typically requires this certification | Medical Devices → requires_certification → ISO 13485 |
| produces_data | Manufacturing Process | Data Type | This process generates this type of data | Injection Molding → produces_data → Cavity Pressure Curves |
| enables_method | Technology | Quality Method | This technology enables/supports this quality method | RJG CoPilot → enables_method → Decoupled Molding |
| manufactures | Company (Infrastructure) | Equipment/Technology | This company makes/sells this product | RJG → manufactures → CoPilot |
| successor_of | Technology | Technology | This technology replaced/evolved from the earlier one | RJG CoPilot → successor_of → RJG eDart |
| integrates_with | Technology | Technology | These technologies have documented data integration | IQMS/DELMIAworks → integrates_with → RJG CoPilot |
| embedded_in | Technology | Technology | This technology is natively included in another | DME CAD Library → embedded_in → SolidWorks (via IMOLD) |
| competes_with | Technology | Technology | These technologies serve the same function | Moldflow → competes_with → Moldex3D |

---

## Section 4: Extracted Instances (Starter Population)

The tables below contain every distinct entity extracted from the research reports across all states and clusters. Near-duplicates are preserved intentionally — deduplication is a later step.

---

### 4.1 Technology / Software Instances

| Instance | Type | Subtype | Source Reports | Notes |
|----------|------|---------|---------------|-------|
| RJG eDart | Technology | Cavity Pressure Monitoring | Erie, MI, IL, IN, Tier 1 | Legacy system; gold readiness signal. Being replaced by CoPilot |
| RJG CoPilot | Technology | Cavity Pressure Monitoring | Infrastructure profiles | Successor to eDart; includes MAX AI advisor |
| RJG MAX | Technology | AI/ML Platform | Infrastructure profiles | AI troubleshooting advisor on CoPilot hardware |
| RJG The Hub | Technology | Data Platform | Infrastructure profiles | Centralized data server for process templates and history |
| RJG Lynx Sensors | Technology | Cavity Pressure Monitoring (Hardware) | Infrastructure profiles | Proprietary smart sensors |
| Kistler ComoNeo | Technology | Cavity Pressure Monitoring | Infrastructure profiles | Up to 32 cavity inputs; competes with CoPilot |
| Kistler ComoNeoPREDICT | Technology | AI/ML Platform | Infrastructure profiles | AI-based quality prediction on ComoNeo data |
| Priamus FILLCONTROL | Technology | Cavity Pressure Monitoring | Infrastructure profiles | Automatic melt front detection; Barnes/Apollo owned |
| Moldflow (Autodesk) | Technology | Mold Flow Simulation (CAE) | Erie, Meadville, MI, IL, IN, FL, Tier 1 | Most commonly referenced simulation tool |
| Moldflow Insight Premium | Technology | Mold Flow Simulation (CAE) | Erie (Accudyn) | Advanced tier of Moldflow |
| Moldex3D | Technology | Mold Flow Simulation (CAE) | Tier 1 (Empire Precision) | Taiwan-based competitor to Moldflow |
| SIGMASOFT | Technology | Virtual Molding Simulation | Meadville (C&J Industries) | Full 3D mold flow + thermal simulation |
| SigmaSoft Virtual Molding | Technology | Virtual Molding Simulation | Erie (F&S Tool) | Full virtual molding platform |
| SolidWorks | Technology | CAD / Mold Design | Erie, Meadville, IL, IN, FL, multiple | Most common mold design CAD platform |
| Siemens NX | Technology | CAD / Mold Design | Infrastructure (DME library integration) | Enterprise-level CAD |
| CREO (Pro/E) | Technology | CAD / Mold Design | Erie (Custom Tool/Tessy), Meadville | Parametric modeling platform |
| AutoCAD | Technology | CAD / Mold Design | Tier 1 (Tessy) | 2D/3D drafting |
| Unigraphics (NX) | Technology | CAD / Mold Design | Tier 1 (Tessy) | Legacy name for Siemens NX |
| MasterCAM | Technology | CAM / CNC Programming | Erie (Custom Tool/Tessy), Meadville | Widely used CNC programming |
| PowerMill | Technology | CAM / CNC Programming | Various | 5-axis CNC programming |
| IQMS / DELMIAworks | Technology | ERP/MRP | MI (Ironwood), FL (Seaway) | Injection molding-specific ERP platform |
| HubSpot CRM | Technology | CRM | Meadville (C&J Industries — sales only) | NOT manufacturing system — notable gap |
| Tacton CPQ | Technology | CPQ | Infrastructure (Husky) | 60-70 variables per solution, auto-BOM generation |
| Husky Advantage+Elite | Technology | Data Platform / IoT Hub | Infrastructure profiles | 1,000+ connected machines, Azure-based |
| Husky Shotscope 4.0 | Technology | Process Monitoring | Infrastructure profiles | Up to 250 process variables per machine |
| Husky Altanium + DataWave 2.0 | Technology | Temperature Control Software | Infrastructure profiles | Mold controller with digital integration |
| Mold-Masters TempMaster M4 | Technology | Temperature Control Software | Infrastructure profiles | HR-Connect digital thermocouple elimination |
| Mold-Masters APS-AI | Technology | AI/ML Platform | Infrastructure profiles | Adaptive Process System for faster setpoints |
| DME SmartMold | Technology | Mold Monitoring | Infrastructure profiles | IoT mold monitoring system |
| DME Flosense | Technology | Process Monitoring | Infrastructure profiles | Digital cooling flow monitoring |
| DME CAD Parts Library | Technology | Component Catalog (Digital) | Infrastructure profiles | 35,000+ parametric models, multi-format |
| DME Mold Base Configurator | Technology | Component Catalog (Digital) | Infrastructure profiles | Online configuration tool |
| HASCO Portal / SET | Technology | Component Catalog (Digital) | Infrastructure profiles | 100,000+ products, 40+ CAD formats |
| HASCO Mold Track | Technology | Mold Monitoring | Infrastructure profiles | Ultra-wideband indoor localization |
| HASCO Loc Check | Technology | Mold Monitoring | Infrastructure profiles | GPS mold tracker |
| HASCO RFID Tagging | Technology | Mold Monitoring | Infrastructure profiles | Digital product history + anti-counterfeiting |
| Progressive CVe Monitor RT | Technology | Mold Monitoring | Infrastructure profiles | Real-time Bluetooth cycle counter |
| Progressive ProFile v5 | Technology | Data Platform | Infrastructure profiles | Cloud mold asset management, 30+ years of data |
| Beaumont MeltFlipper | Technology | Runner Balance Technology | Erie (Beaumont profile) | 700+ licensees; patented runner balance |
| Beaumont Therma-flo / Molding Genius | Technology | Mold Flow Software | Erie (Beaumont profile) | Thermal analysis / process optimization software |
| Paulson SimTech | Technology | Training Simulation | Infrastructure profiles | Only online molding machine simulator |
| Conair Industry 4.0 Material Handling | Technology | Material Handling System | MI (PTI) | Connected material handling with IIoT |
| PC-DMIS | Technology | Statistical / Metrology Software | IL (Wise Plastics) | Coordinate measurement analysis |
| SCADA | Technology | Process Monitoring | IL (Hoffer Plastics) | Supervisory control and data acquisition |
| Mantle Automated Toolmaking System | Technology | Additive Manufacturing (Tooling) | FL (Seaway Plastics) | 3D-printed + CNC mold cores/cavities |

### 4.2 Certification Instances

| Instance | Type | Scope | Source Reports | Notes |
|----------|------|-------|---------------|-------|
| ISO 9001 | General QMS | Company-wide quality management | All reports | Baseline certification; nearly universal |
| ISO 9001:2015 | General QMS | Current revision | Multiple | Specific version commonly cited |
| ISO 13485 | Medical Device QMS | Medical device quality system | Erie, Meadville, MI, IL, IN, FL, Tier 1 | Strong readiness signal per alliance framework |
| ISO 13485:2016 | Medical Device QMS | Current revision | Meadville (C&J, QTD, Holbrook), FL | Specific version |
| IATF 16949 | Automotive QMS | Automotive supply chain quality | Erie (Accudyn), MI, IL, IN | Formerly ISO/TS 16949 |
| ISO/TS 16949 | Automotive QMS | Legacy automotive standard | IL (Fabrik) | Predecessor to IATF 16949 |
| AS9100 | Aerospace QMS | Aerospace quality management | MI (Vaupell), FL | Often paired with NADCAP |
| AS9100D | Aerospace QMS | Current revision | MI (Vaupell) | Specific version |
| NADCAP | Aerospace Accreditation | Special process accreditation for aerospace | MI (Vaupell), FL (Seaway) | National Aerospace and Defense Contractors Accreditation Program |
| MedAccred | Medical Accreditation | Plastics-specific medical accreditation | MI (PTI), IL (Hoffer) | Arguably more rigorous than ISO 13485 for plastics |
| FDA Registration | Medical / Pharma | Facility registration with US FDA | Meadville (C&J), FL, multiple | Required for medical device manufacturing in US |
| ITAR Registration | Defense Security | International Traffic in Arms compliance | MI (PTI, Ironwood), Tier 1, IL, FL | Required for defense articles |
| UL Recognition / Listing | Product Safety | Underwriters Laboratories compliance | Erie (GeorgeKo), IL | Product and material safety certification |
| SQF (Safe Quality Food) | Food Safety | Food-contact manufacturing quality | Erie (EMP, Munot) | Required for food packaging |
| ISO 14001 | Environmental | Environmental management system | IL (Hoffer, March 2026) | Signals environmental commitment |
| ISO Class 7 Cleanroom | Cleanroom Classification | 10,000 particles/ft³ max | Erie (X-Cell), Tier 1 (Tessy, Currier) | Higher-grade cleanroom |
| ISO Class 8 Cleanroom | Cleanroom Classification | 100,000 particles/ft³ max | Meadville (C&J), FL, multiple | Standard medical molding cleanroom |
| WBENC | Ownership/Diversity | Women's Business Enterprise National Council | Erie (Accudyn), FL (American Tool & Mold) | May open additional grant pathways |
| OSHA SHARP | Safety | Safety & Health Achievement Recognition Program | IL (Wise Plastics, both facilities) | Highest safety honor for small business |
| BAC 5321 | Aerospace Specification | Boeing material specification | MI (Vaupell) | Aerospace-specific material compliance |
| cGMP | Medical/Pharma | Current Good Manufacturing Practice | Erie (EMP — implied), FL | FDA regulation for pharma packaging |

### 4.3 Equipment Brand Instances

| Instance | Type | Key Models/Series | Source Reports | Notes |
|----------|------|------------------|---------------|-------|
| Arburg | Injection Molding Machine | Allrounder series | Erie (EMP), Meadville (TTMP), IL (Fabrik), IN | German manufacturer; all-electric options |
| ENGEL | Injection Molding Machine | Various (incl. tie-bar-less) | Meadville, MI (Anderson), IN, FL | Austrian manufacturer; Roembke partner |
| Nissei | Injection Molding Machine | NEX series (all-electric) | Erie (Accudyn), Meadville (TTMP) | Japanese; all-electric focus |
| Sumitomo (SHI) | Injection Molding Machine | SE-EV series | Erie (Accudyn) | Japanese; all-electric |
| Cincinnati Milacron | Injection Molding Machine | RoboShot (all-electric) | Meadville (Pasco Tool) | American; now Milacron/Hillenbrand |
| Toshiba | Injection Molding Machine | Various | IL (Fabrik) | Japanese |
| Husky | Injection Molding Machine | HyPET, HyCAP, HyPERSYNC, ICHOR | Infrastructure profiles | PET preform systems; also hot runner manufacturer |
| KraussMaffei | Injection Molding Machine | Various | Infrastructure (conference sponsor) | German; multi-process |
| Wittmann | Injection Molding Machine + Auxiliary | Industry 4.0 work cell | Infrastructure (loaned to PSB) | Austrian; also robots and auxiliary equipment |
| iMFLUX | Injection Molding Technology | Low constant pressure molding | Infrastructure (conference sponsor, AIM donated) | P&G subsidiary; donated unit to AIM Institute |
| JSW | Injection Molding Machine | Various | FL (implied) | Japan Steel Works |
| Yasda | CNC Machining Center | 5-axis | Erie (X-Cell, Adler/RMS) | Ultra-precision Japanese CNC |
| Roku-Roku | CNC Machining Center | HC658II graphite milling | FL (American Tool & Mold) | Automated electrode production |
| Mitsubishi | EDM | Wire EDM | FL (American Tool & Mold) | |
| Mitutoyo | CMM | Various | FL (American Tool & Mold) | Japanese metrology |
| Zeiss | Metrology | CT Scanner | Erie (Adler/RMS) | Industrial CT scanning |
| Markforged | 3D Printer | X7 | Meadville (TTMP/PRISM) | Continuous fiber reinforcement |
| 3D Systems | 3D Printer | Figure 4 | Meadville (TTMP/PRISM) | Production-grade DLP printing |
| Mantle | 3D Printer (Tooling) | Automated Toolmaking System | FL (Seaway) | 3D-printed mold inserts |
| Conair | Material Handling | Industry 4.0 systems | MI (PTI) | Connected material handling |
| System 3R | Automation / Tooling | Robotic electrode handling | FL (American Tool & Mold) | Workholding and automation |
| STÄUBLI | Robotics | Various | IN (Roembke partner) | Industrial robots for molding cells |

### 4.4 Material Instances

| Instance | Type | Source Reports | Notes |
|----------|------|---------------|-------|
| Polypropylene (PP) | Commodity Thermoplastic | Erie (EMP, Pinnacle/Clarke), multiple | High-volume; caps/closures |
| Polyethylene (PE/HDPE/LDPE) | Commodity Thermoplastic | Multiple | Heavy wall (APC — gas distribution) |
| ABS | Commodity Thermoplastic | Erie (GeorgeKo), multiple | General-purpose engineering |
| Polycarbonate (PC) | Engineering Thermoplastic | Erie (GeorgeKo), MI | Optical clarity, impact resistance |
| Nylon / Polyamide (PA) | Engineering Thermoplastic | Erie, MI, multiple | Structural applications |
| Glass-Filled Nylon | Filled / Reinforced | Erie (Accudyn), multiple | Enhanced strength and stiffness |
| Acetal / POM | Engineering Thermoplastic | Erie (GeorgeKo, Accudyn) | Precision gears, bearings |
| PPS (Polyphenylene Sulfide) | High-Performance Thermoplastic | Erie (Accudyn, GeorgeKo) | High-temp, chemical resistant |
| PEI / Ultem | High-Performance Thermoplastic | Erie (Accudyn) | Extreme temperature resistance |
| PBT (Polybutylene Terephthalate) | Engineering Thermoplastic | Multiple | Electrical connectors |
| PVC | Commodity Thermoplastic | Erie (GeorgeKo, Pinnacle) | Rigid and flexible grades |
| Crystal Styrene | Commodity Thermoplastic | Erie (Pinnacle/Clarke) | Transparent packaging |
| TPE / TPR | Elastomer | Erie (GeorgeKo, Pinnacle), multiple | Flexible overmolding |
| LSR (Liquid Silicone Rubber) | Elastomer | IN (Roembke), FL (SIMTEC), Tier 1 (Tessy) | Cold-deck tooling; medical, automotive |
| HCR (High Consistency Rubber) | Elastomer | IN (Roembke) | Traditional rubber molding |
| BMC / SMC | Thermoset (Composite) | Erie (Haysite) | Fiberglass reinforced; compression molding |
| Polyester (Thermoset) | Thermoset | Erie (Haysite, GeorgeKo) | Fiberglass reinforced composites |

### 4.5 Quality Method Instances (Company-Specific)

| Company | Method | Source | Confidence |
|---------|--------|--------|------------|
| PRISM/TTMP (Meadville) | Decoupled Molding (via 8 RJG Master Molders) | Meadville report | Confirmed |
| PTI Engineered Plastics (MI) | Decoupled III Molding | Michigan report | Confirmed |
| NyproMold (IL) | Decoupled III Molding | Illinois report | Confirmed |
| Wise Plastics (IL) | Scientific Molding + Decoupled Molding | Illinois report | Confirmed |
| Pasco Tool (Meadville) | Scientific Molding + DOE + Decoupled Molding | Meadville report | Confirmed |
| Crescent Industries (PA) | Industry 4.0 monitoring all presses | Tier 1 report | Confirmed |
| Hoffer Plastics (IL) | Scientific Molding + SPC + SCADA | Illinois report | Confirmed |
| TH Plastics (MI) | Scientific Molding + SPC + DOE + Cavity Pressure | Michigan report | Confirmed |
| Anderson Technologies (MI) | Scientific Molding (RJG eDart) | Michigan report | Confirmed |
| Ironwood Plastics (MI) | Scientific Molding + Predictive Maintenance | Michigan report | Confirmed |
| Fabrik Molded Plastics (IL) | Scientific Molding (RJG eDart) | Illinois report | Confirmed |
| C&J Industries (Meadville) | SIGMASOFT simulation + Scientific molding | Meadville report | Confirmed |
| Hoffer Plastics (IL) | APQP + Lean/Six Sigma | Illinois report | Confirmed |
| Crescent Industries (PA) | QRM (Quick Response Manufacturing) | Tier 1 report | Confirmed |
| American Tool & Mold (FL) | FMEA + Cpk/Ppk/PPAP | Florida report | Confirmed |
| Seaway Plastics (FL) | IQ/OQ/PQ Validation | Florida report | Confirmed |

---

## Section 5: Extracted Relationship Instances (Starter Triples)

### 5.1 Company → Technology Relationships (uses_technology)

| Subject | Relationship | Object | Source | Confidence |
|---------|-------------|--------|--------|------------|
| Accudyn Products | uses_technology | Moldflow Insight Premium | Erie 42-company report | Confirmed |
| Accudyn Products | uses_technology | SolidWorks | Erie 42-company report | Confirmed |
| Accudyn Products | uses_technology | 3D Laser Scanning | Erie 42-company report | Confirmed |
| PRISM / TTMP | uses_technology | RJG eDart | Meadville report | Confirmed |
| PRISM / TTMP | uses_technology | CT Scanning | Meadville report | Confirmed |
| PRISM / TTMP | uses_technology | Markforged X7 | Meadville report | Confirmed |
| PRISM / TTMP | uses_technology | 3D Systems Figure 4 | Meadville report | Confirmed |
| C&J Industries | uses_technology | SIGMASOFT | Meadville report | Confirmed |
| C&J Industries | uses_technology | SLA Prototyping | Meadville report | Confirmed |
| C&J Industries | uses_technology | HubSpot CRM | Meadville report | Confirmed (sales only) |
| Pasco Tool | uses_technology | SolidWorks (CSWP) | Meadville report | Confirmed |
| Custom Tool / Tessy Tooling | uses_technology | CREO (Pro/E) | Erie 42-company report | Confirmed |
| Custom Tool / Tessy Tooling | uses_technology | SolidWorks | Erie 42-company report | Confirmed |
| Custom Tool / Tessy Tooling | uses_technology | MasterCAM | Erie 42-company report | Confirmed |
| Tessy Plastics | uses_technology | Moldflow | Tier 1 report | Confirmed |
| Tessy Plastics | uses_technology | SolidWorks | Tier 1 report | Confirmed |
| Tessy Plastics | uses_technology | AutoCAD | Tier 1 report | Confirmed |
| Tessy Plastics | uses_technology | CREO (Pro/E) | Tier 1 report | Confirmed |
| Tessy Plastics | uses_technology | Unigraphics (NX) | Tier 1 report | Confirmed |
| Adler / Rapid Mold Solutions | uses_technology | Moldflow MPI | Erie 42-company report | Confirmed |
| Adler / Rapid Mold Solutions | uses_technology | Zeiss CT Scanner | Erie 42-company report | Confirmed |
| F&S Tool | uses_technology | SigmaSoft Virtual Molding | Erie 42-company report | Confirmed |
| PTI Engineered Plastics | uses_technology | RJG eDart | Michigan report | Confirmed |
| PTI Engineered Plastics | uses_technology | Moldflow | Michigan report | Confirmed |
| PTI Engineered Plastics | uses_technology | Conair Industry 4.0 | Michigan report | Confirmed |
| Ironwood Plastics | uses_technology | RJG eDart (all machines) | Michigan report | Confirmed |
| Ironwood Plastics | uses_technology | IQMS / DELMIAworks | Michigan report | Confirmed |
| TH Plastics | uses_technology | Custom ERP (injection molding-specific) | Michigan report | Confirmed |
| Anderson Technologies | uses_technology | RJG eDart | Michigan report | Confirmed |
| Fabrik Molded Plastics | uses_technology | RJG eDart | Illinois report | Confirmed |
| Hoffer Plastics | uses_technology | SCADA System | Illinois report | Confirmed |
| NyproMold | uses_technology | CT Scanning (3D ProScan) | Illinois report | Confirmed |
| Wise Plastics | uses_technology | PC-DMIS | Illinois report | Confirmed |
| Automation Plastics Corp (APC) | uses_technology | RJG (confirmed) | Tier 1 report | Confirmed |
| Automation Plastics Corp (APC) | uses_technology | IQMS ERP | Tier 1 report | Confirmed |
| Empire Precision | uses_technology | Moldex3D | Tier 1 report | Confirmed |
| Crescent Industries | uses_technology | Industry 4.0 monitoring (all presses) | Tier 1 report | Confirmed |
| Seaway Plastics | uses_technology | IQMS / DELMIAworks | Florida report | Confirmed |
| Seaway Plastics | uses_technology | Mantle Automated Toolmaking | Florida report | Confirmed |
| American Tool & Mold | uses_technology | Roku-Roku graphite milling cells | Florida report | Confirmed |
| American Tool & Mold | uses_technology | System 3R robotics | Florida report | Confirmed |
| Husky Technologies | uses_technology | Tacton CPQ | Infrastructure profiles | Confirmed |
| Husky Technologies | uses_technology | Microsoft Azure IoT Hub | Infrastructure profiles | Confirmed |
| American Plastic Molding (IN) | uses_technology | Moldflow | Indiana report | Confirmed |
| American Plastic Molding (IN) | uses_technology | SolidWorks | Indiana report | Confirmed |

### 5.2 Company → Certification Relationships (holds_certification)

| Subject | Relationship | Object | Source | Confidence |
|---------|-------------|--------|--------|------------|
| Accudyn Products | holds_certification | ISO 9001 | Erie report | Confirmed |
| Accudyn Products | holds_certification | IATF 16949 | Erie report | Confirmed |
| C&J Industries | holds_certification | ISO 13485:2016 | Meadville report | Confirmed |
| C&J Industries | holds_certification | FDA Registration | Meadville report | Confirmed |
| QTD Plastics | holds_certification | ISO 13485:2016 | Meadville report | Confirmed |
| Holbrook / Allegheny Performance | holds_certification | ISO 13485:2016 | Meadville report | Confirmed |
| X-Cell / SyBridge | holds_certification | ISO 13485 | Erie report | Confirmed |
| X-Cell / SyBridge | holds_certification | ISO Class 7 Cleanroom | Erie report | Confirmed |
| Caplugs / ShoreView | holds_certification | ISO 13485 | Erie report | Confirmed |
| Caplugs / ShoreView | holds_certification | IATF 16949 | Erie report | Confirmed |
| Essentra Components | holds_certification | ISO 9001 | Erie report | Confirmed |
| Erie Molded Packaging | holds_certification | ISO 9001:2015 | Erie report | Confirmed |
| Erie Molded Packaging | holds_certification | SQF | Erie report | Confirmed |
| Munot Plastics | holds_certification | ISO 9001:2015 | Erie report | Confirmed |
| Munot Plastics | holds_certification | SQF | Erie report | Confirmed |
| GeorgeKo Industries | holds_certification | ISO 9001:2015 | Erie report | Confirmed |
| PTI Engineered Plastics | holds_certification | ISO 13485 | Michigan report | Confirmed |
| PTI Engineered Plastics | holds_certification | IATF 16949 | Michigan report | Confirmed |
| PTI Engineered Plastics | holds_certification | MedAccred | Michigan report | Confirmed |
| PTI Engineered Plastics | holds_certification | ITAR | Michigan report | Confirmed |
| Ironwood Plastics | holds_certification | IATF 16949 | Michigan report | Confirmed |
| Ironwood Plastics | holds_certification | ITAR | Michigan report | Confirmed |
| TH Plastics | holds_certification | IATF 16949 | Michigan report | Confirmed |
| Vaupell / Sumitomo Bakelite | holds_certification | ISO 13485 | Michigan report | Confirmed |
| Vaupell / Sumitomo Bakelite | holds_certification | AS9100D | Michigan report | Confirmed |
| Vaupell / Sumitomo Bakelite | holds_certification | NADCAP | Michigan report | Confirmed |
| Vaupell / Sumitomo Bakelite | holds_certification | MedAccred | Michigan report | Confirmed |
| Vaupell / Sumitomo Bakelite | holds_certification | ITAR | Michigan report | Confirmed |
| Crescent Industries | holds_certification | ISO 13485 | Tier 1 report | Confirmed |
| Crescent Industries | holds_certification | ITAR | Tier 1 report | Confirmed |
| Empire Precision | holds_certification | ISO 13485 | Tier 1 report | Confirmed |
| Empire Precision | holds_certification | ITAR | Tier 1 report | Confirmed |
| Currier Plastics | holds_certification | ISO 13485 | Tier 1 report | Confirmed |
| Tessy Plastics | holds_certification | ISO 13485 | Tier 1 report | Confirmed |
| Hoffer Plastics | holds_certification | MedAccred | Illinois report | Confirmed |
| Hoffer Plastics | holds_certification | IATF 16949 | Illinois report | Confirmed |
| Hoffer Plastics | holds_certification | ISO 14001:2015 | Illinois report | Confirmed |
| Wise Plastics | holds_certification | ISO 13485:2016 | Illinois report | Confirmed |
| Wise Plastics | holds_certification | ITAR | Illinois report | Confirmed |
| Wise Plastics | holds_certification | OSHA SHARP (both facilities) | Illinois report | Confirmed |
| Fabrik Molded Plastics | holds_certification | ISO/TS 16949 | Illinois report | Confirmed |
| Seaway Plastics | holds_certification | ISO 13485 (all 5 facilities) | Florida report | Confirmed |
| Seaway Plastics | holds_certification | ITAR | Florida report | Confirmed |
| Seaway Plastics | holds_certification | NADCAP | Florida report | Confirmed |
| American Tool & Mold | holds_certification | AS9100 | Florida report | Confirmed |
| American Tool & Mold | holds_certification | ISO 13485 | Florida report | Confirmed |
| American Tool & Mold | holds_certification | ITAR | Florida report | Confirmed |
| American Tool & Mold | holds_certification | WBENC | Florida report | Confirmed |

### 5.3 Company → Company Relationships (Corporate Structure)

| Subject | Relationship | Object | Date | Source | Confidence |
|---------|-------------|--------|------|--------|------------|
| X-Cell Tool & Mold | acquired_by | SyBridge Technologies (Crestview Partners) | ~2020 | Erie report | Confirmed |
| Custom Tool & Design | acquired_by | Tessy Plastics | 2019 | Erie report | Confirmed |
| Rapid Mold Solutions | acquired_by | Adler Industrial Solutions | Nov 2021 | Erie report | Confirmed |
| F&S Tool | acquired_by | Berry Global | April 2024 | Erie report | Confirmed |
| Caplugs | acquired_by | ShoreView Industries | 2023 | Erie report | Confirmed |
| Niagara Caps & Plugs | absorbed_into | Caplugs | ~2003 | Erie report | Confirmed |
| Alliance Plastics | legacy_name_of | Essentra Components | 1968→Essentra | Erie report | Confirmed |
| TTMP / Tech Tool | acquired_by | PRISM Plastics | June 2016 | Meadville report | Confirmed |
| PRISM Plastics | acquired_by | Marmon (Berkshire Hathaway) | April 2017 | Meadville report | Confirmed |
| Holbrook Tool | acquired_by | Allegheny Performance Plastics | Oct 2025 | Meadville report | Confirmed |
| Pinnacle Molds (Saegertown) | acquired_by | Adler Industrial | — | Erie/Meadville | Confirmed |
| Currier Plastics | acquired_by | Sheridan Capital Partners | Sept 2025 | Tier 1 report | Confirmed |
| Empire Precision | acquired_by | Kouza Capital | Oct 2023 | Tier 1 report | Confirmed |
| Hillenbrand | parent_of | DME Company | — | Infrastructure | Confirmed |
| Hillenbrand | parent_of | Mold-Masters | — | Infrastructure | Confirmed |
| DME Company | sister_company_of | Mold-Masters | — | Infrastructure | Confirmed |
| Barnes Group | parent_of | Synventive | — | Infrastructure | Confirmed |
| Barnes Group | parent_of | Priamus | — | Infrastructure | Confirmed |
| Barnes Group | parent_of | FOBOHA | — | Infrastructure | Confirmed |
| Barnes Group | parent_of | Männer | — | Infrastructure | Confirmed |
| Barnes Group | parent_of | Thermoplay | — | Infrastructure | Confirmed |
| Barnes Group | parent_of | Gammaflux | — | Infrastructure | Confirmed |
| Barnes Group | acquired_by | Apollo Global Management | 2024 (pending) | Infrastructure | Confirmed |
| GPGI Inc. | parent_of | Husky Technologies | Jan 2026 | Infrastructure | Confirmed |
| Oerlikon Group | parent_of | HRSflow | 2021 | Infrastructure | Confirmed |
| Berndorf AG | parent_of | HASCO | 2007 | Infrastructure | Confirmed |
| CTB / Berkshire Hathaway | parent_of | Ironwood Plastics | 2010 | Michigan report | Confirmed |
| Sumitomo Bakelite | parent_of | Vaupell | 2014 | Michigan report | Confirmed |
| ICG (Intermediate Capital) | parent_of | Seaway Plastics | 2022 | Florida report | Confirmed |
| Semperit AG / RICO Group | parent_of | SIMTEC Silicone | — | Florida report | Confirmed |
| Isovolta Group | parent_of | Haysite Reinforced Plastics | 2018 | Erie report | Confirmed |
| Clarience Technologies | parent_of | Truck-Lite | — | Erie report | Confirmed |
| Essentra plc | parent_of | Essentra Components (Erie) | — | Erie report | Confirmed |
| Toledo Molding & Die | subsidiary_of | First Brands Group (bankrupt) | — | Tier 1 report | Confirmed |
| Paulson Training | acquired_by | Certus | March 2024 | Infrastructure | Confirmed |

### 5.4 Infrastructure Company → Product Relationships (manufactures)

| Subject | Relationship | Object | Source | Confidence |
|---------|-------------|--------|--------|------------|
| RJG Inc. | manufactures | CoPilot Process Monitoring System | Infrastructure | Confirmed |
| RJG Inc. | manufactures | MAX AI Advisor | Infrastructure | Confirmed |
| RJG Inc. | manufactures | The Hub Data Server | Infrastructure | Confirmed |
| RJG Inc. | manufactures | Lynx Smart Sensors | Infrastructure | Confirmed |
| Kistler | manufactures | ComoNeo Process Monitor | Infrastructure | Confirmed |
| Kistler | manufactures | ComoNeoPREDICT | Infrastructure | Confirmed |
| Priamus | manufactures | FILLCONTROL | Infrastructure | Confirmed |
| DME | manufactures | SmartMold IoT Monitor | Infrastructure | Confirmed |
| DME | manufactures | Flosense Cooling Monitor | Infrastructure | Confirmed |
| DME | manufactures | SmartONE / StellarONE Hot Runners | Infrastructure | Confirmed |
| DME | manufactures | MUD Quick-Change Mold Bases | Infrastructure | Confirmed |
| HASCO | manufactures | Streamrunner (3D-printed manifold) | Infrastructure | Confirmed |
| HASCO | manufactures | Primezone Controllers | Infrastructure | Confirmed |
| HASCO | manufactures | Mold Track UWB System | Infrastructure | Confirmed |
| Progressive Components | manufactures | CVe Monitor RT | Infrastructure | Confirmed |
| Progressive Components | manufactures | ProFile v5 Cloud Platform | Infrastructure | Confirmed |
| Progressive Components | manufactures | UniLifters | Infrastructure | Confirmed |
| Husky | manufactures | Ultra / UltraShot Hot Runner Systems | Infrastructure | Confirmed |
| Husky | manufactures | Altanium Mold Controllers | Infrastructure | Confirmed |
| Husky | manufactures | Advantage+Elite IoT Platform | Infrastructure | Confirmed |
| Husky | manufactures | Shotscope 4.0 Plant Monitor | Infrastructure | Confirmed |
| Mold-Masters | manufactures | Fusion Series G3 Hot Runner | Infrastructure | Confirmed |
| Mold-Masters | manufactures | TempMaster M4 Controller | Infrastructure | Confirmed |
| Mold-Masters | manufactures | APS-AI Adaptive Process System | Infrastructure | Confirmed |
| Mold-Masters | manufactures | E-Multi Auxiliary Injection Units | Infrastructure | Confirmed |
| Beaumont Technologies | manufactures | MeltFlipper Runner Technology | Infrastructure | Confirmed |
| Beaumont Technologies | manufactures | Therma-flo / Molding Genius Software | Infrastructure | Confirmed |
| INCOE Corporation | manufactures | Seal-Fit Unitized Hot Runner Systems | Infrastructure | Confirmed |
| INCOE Corporation | manufactures | SoftGate Velocity Control | Infrastructure | Confirmed |

### 5.5 Domain-Level Relationships (Process → Data, Market → Certification)

| Subject | Relationship | Object | Source | Confidence |
|---------|-------------|--------|--------|------------|
| Injection Molding | produces_data | Cavity Pressure Curves | Domain knowledge + RJG profile | Inferred |
| Injection Molding | produces_data | Process Parameters (temps, pressures, times) | Domain knowledge | Inferred |
| Injection Molding | produces_data | Shot Weight / Cushion Data | Domain knowledge | Inferred |
| Mold Design | produces_data | CAD/CAM Files (3D geometry) | Domain knowledge | Inferred |
| Mold Design | produces_data | Mold Flow Simulation Results | Domain knowledge | Inferred |
| Mold Design | produces_data | BOM / Material Specifications | Domain knowledge | Inferred |
| Mold Monitoring | produces_data | Cycle Count / Uptime Data | Progressive CVe profile | Confirmed |
| Medical Devices | requires_certification | ISO 13485 | Prospect framework | Confirmed |
| Medical Devices | requires_certification | FDA Registration | Prospect framework | Confirmed |
| Automotive | requires_certification | IATF 16949 | Prospect framework | Confirmed |
| Aerospace | requires_certification | AS9100 | MI (Vaupell) profile | Confirmed |
| Aerospace | requires_certification | NADCAP | MI (Vaupell) profile | Confirmed |
| Defense | requires_certification | ITAR Registration | Multiple reports | Confirmed |
| Food Packaging | requires_certification | SQF | Erie (EMP, Munot) | Confirmed |
| RJG CoPilot | enables_method | Decoupled Molding | RJG profile | Confirmed |
| RJG CoPilot | enables_method | Scientific Molding | RJG profile | Confirmed |
| RJG CoPilot | monitors | Injection Molding | RJG profile | Confirmed |
| Kistler ComoNeo | monitors | Injection Molding | Kistler profile | Confirmed |
| Priamus FILLCONTROL | monitors | Injection Molding | Priamus profile | Confirmed |
| Progressive CVe | monitors | Mold Lifecycle | Progressive profile | Confirmed |
| RJG CoPilot | successor_of | RJG eDart | RJG profile | Confirmed |
| Mold-Masters TempMaster M4 | successor_of | TempMaster M3 | Mold-Masters profile | Confirmed |
| DME CAD Library | embedded_in | SolidWorks (via IMOLD) | DME profile | Confirmed |
| DME CAD Library | embedded_in | Siemens NX (via Mold Wizard) | DME profile | Confirmed |
| HASCO Component Library | embedded_in | Autodesk Inventor (Mold Design) | HASCO profile | Confirmed |

### 5.6 RJG Partnership / Supply Relationships

| Subject | Relationship | Object | Source | Confidence |
|---------|-------------|--------|--------|------------|
| RJG Inc. | partners_with | Penn State Behrend | Infrastructure + Erie reports | Confirmed |
| RJG Inc. | supplies_to | Fabrik Molded Plastics | IL report | Confirmed |
| RJG Inc. | supplies_to | PTI Engineered Plastics | MI report | Confirmed |
| RJG Inc. | supplies_to | Ironwood Plastics | MI report | Confirmed |
| RJG Inc. | supplies_to | Anderson Technologies | MI report | Confirmed |
| RJG Inc. | supplies_to | Automation Plastics Corp | Tier 1 report | Confirmed |
| RJG Inc. | supplies_to | PRISM / TTMP (Meadville) | Meadville report | Confirmed |
| RJG Inc. | supplies_to | X-Cell / SyBridge (Erie) | Erie report (Aaron Bentley) | Confirmed |
| RJG Inc. | competes_with | Kistler (in cavity pressure monitoring) | Infrastructure | Confirmed |
| RJG Inc. | competes_with | Priamus (in cavity pressure monitoring) | Infrastructure | Confirmed |
| Moldflow | competes_with | Moldex3D | Multiple reports | Confirmed |
| Moldflow | competes_with | SIGMASOFT | Meadville (C&J uses SIGMASOFT, not Moldflow) | Confirmed |
| Husky | competes_with | Mold-Masters (in hot runners) | Infrastructure | Confirmed |
| DME | competes_with | HASCO (in mold components) | Infrastructure | Confirmed |
| DME | competes_with | Meusburger (in mold components) | Infrastructure | Confirmed |

---

## Section 6: Ontology Gaps & Recommendations

### 6.1 Entity types that should exist but have few/no instances

**Mold (as an individual asset):** The ontology doesn't yet have a class for individual molds — the physical tools that sit in mold racks at every converter. A mold is the central object in this domain: it was designed (CAD data), built (machining data), sampled (validation data), and runs production (process data). Every company-level data relationship flows through individual molds. The current data rarely identifies specific molds by number or name — but Duane's knowledge graph vision requires mold-level nodes eventually.

**Person / Key Contact:** People appear throughout the research (Brett, Duane, Aaron Bentley, Fred Zeyfang, Brad Johnson) but are not formally typed as ontology entities. For the knowledge graph, key individuals — especially RJG Master Molders, founding engineers, PSB alumni in industry — are nodes that connect companies to capabilities and to PSB.

**Geographic Cluster:** Erie, Meadville/Tool City, Greater Chicago, Detroit metro, Rochester NY, Tampa Bay corridor — these clusters have distinct identities and shared characteristics. They are not just locations but economic ecosystems.

**Pain Point / Problem Type:** The alliance's value propositions map to specific problem types (legacy data chaos, retiring expertise, post-acquisition integration, mold library search, process optimization, quality compliance). These could be a formal class with instances linked to companies via "experiences_problem" relationships.

**Engagement Type:** Pilot, Research, Senior Design, Multiple, TBD — these are already defined in the prospect framework but not yet formalized as ontology entities that can be linked to companies and problems.

**Part / Product Type:** The research mentions specific product categories (caps/closures, medical devices, automotive lighting lenses, prescription vials, PET preforms) but these aren't structured. A Part Type class would help map Company → produces → Part Type → requires → Material/Process chains.

### 6.2 Relationships that are implied but never explicitly stated

**Company → trained_at → Training Provider:** Many companies have RJG Master Molders, implying their staff trained at RJG. This training relationship is rarely documented explicitly in the prospect data.

**Company → competes_with → Company:** Competitive dynamics between converters are almost never documented. Which Erie converters compete for the same medical device OEM contracts?

**Mold → was_built_by → Company and Mold → runs_at → Company:** The mold maker / converter supply chain is the core of this industry, but specific mold-level supply relationships are not in the prospect data.

**Technology → requires → Technology:** Technology stack dependencies (e.g., RJG CoPilot requires cavity pressure sensors, which require specific mounting in the mold) are implied by domain knowledge but not explicitly captured.

**Company → located_near → Company:** Geographic proximity is a key factor for engagement clustering but isn't formalized as a relationship.

### 6.3 Data quality issues

**Inconsistent naming:** The same technology gets different names across reports — "RJG eDart" vs. "eDart System" vs. "RJG in-mold pressure sensors and the eDart monitoring system." The same company appears as "IQMS" or "DELMIAworks" depending on when the reference was written (brand name changed after Dassault acquisition). Normalization rules are needed.

**Certification version ambiguity:** Some profiles list "ISO 13485" without specifying whether it's the 2016 revision. IATF 16949 vs. the legacy ISO/TS 16949 are sometimes conflated.

**Revenue estimates vary wildly:** Different sources (ZoomInfo, Manta, D&B, LinkedIn) give very different revenue estimates for the same company. The ontology should flag confidence levels on revenue data.

**Process terminology overlap:** "Scientific molding" is both a philosophy and a catchall for specific techniques (decoupled molding, cavity pressure monitoring, DOE). Some companies claim "scientific molding" but may only mean "we follow a documented process" without cavity pressure instrumentation.

### 6.4 Recommendations for future research rounds

1. **Ask about specific mold counts** during discovery — "How many active tools do you run?" gives a quantifiable node count for the ontology
2. **Document technology stacks more precisely** — distinguish between "uses RJG sensors" vs. "runs full CoPilot system with The Hub" vs. "has eDart on some machines"
3. **Capture ERP/MES system names** consistently — this is one of the most actionable data points for understanding a company's data infrastructure and it's inconsistently documented
4. **Track apprenticeship program details** — number of graduates, years running, certifying body — as these are quantifiable workforce capability metrics
5. **Note which companies use which DME/HASCO/MISUMI standard** for mold components — this maps directly to data interoperability across the ontology
6. **Flag hot runner brand in use** at converters — this connects converters to infrastructure companies and is rarely documented in current research

---

## Section 7: Schema Recommendations for Database Implementation

### 7.1 Suggested table structures

**`ontology_entity_types`** — The class definitions from Section 2

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | |
| name | varchar | e.g., "Certification", "Manufacturing Process" |
| parent_type_id | FK → self | For hierarchical types (e.g., "All-Electric Press" → "Injection Molding Machine") |
| definition | text | One-sentence definition |
| attributes_schema | jsonb | Key attributes this type should have |
| created_at | timestamp | |

**`ontology_entities`** — The instances from Section 4

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | |
| type_id | FK → ontology_entity_types | What class this instance belongs to |
| name | varchar | Display name (normalized) |
| aliases | text[] | Alternative names, legacy names, abbreviations |
| attributes | jsonb | Type-specific properties (version, vendor, scope, etc.) |
| source | varchar | Which report/record this was extracted from |
| confidence | varchar | Confirmed / Likely / Inferred |
| layer | int | 1 = auto-derived from structured fields, 2 = extracted from research briefs |
| created_at | timestamp | |
| updated_at | timestamp | |

**`ontology_relationship_types`** — The verbs from Section 3

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | |
| name | varchar | e.g., "uses_technology", "holds_certification" |
| domain_type_id | FK → ontology_entity_types | What type of entity is the subject |
| range_type_id | FK → ontology_entity_types | What type of entity is the object |
| definition | text | What this relationship means |
| inverse_name | varchar | Name of the reverse relationship (nullable) |

**`ontology_relationships`** — The triples from Section 5

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | |
| type_id | FK → ontology_relationship_types | Which relationship type |
| subject_entity_id | FK → ontology_entities | The subject |
| object_entity_id | FK → ontology_entities | The object |
| source | varchar | Which report/record |
| confidence | varchar | Confirmed / Likely / Inferred |
| effective_date | date | When this relationship became true (nullable) |
| end_date | date | When this relationship ended (nullable — for acquisitions, etc.) |
| layer | int | 1 or 2 |
| created_at | timestamp | |

### 7.2 Layer 1 → Ontology mapping

Structured prospect fields auto-generate ontology entities and relationships on record save:

| Prospect Field | Ontology Entity Type | Relationship Generated |
|---------------|---------------------|----------------------|
| Category (Converter, Mold Maker, etc.) | Company (subtype attribute) | — (attribute, not relationship) |
| Tooling Control | — | Attribute on Company entity |
| Certifications (comma-separated) | Certification | Company → holds_certification → Certification |
| Markets Served (comma-separated) | Market Vertical | Company → serves_market → Market Vertical |
| Processes (injection, blow, etc.) | Manufacturing Process | Company → operates_process → Process |
| Ownership Structure | Ownership Structure | Company → has_ownership_structure → Structure |
| Parent Company | Company | Company → subsidiary_of → Parent Company |
| Legacy/AKA | — | Added to Company entity's aliases array |

### 7.3 Layer 2 → Ontology extraction triggers

When a research brief is saved (or manually triggered), NLP/pattern matching extracts:

| Pattern | Entity Type Created | Relationship Generated |
|---------|-------------------|----------------------|
| Technology/software name mention | Technology | Company → uses_technology → Technology |
| Equipment brand mention | Equipment Brand | Company → uses_equipment_brand → Brand |
| Quality method mention | Quality Method | Company → employs_method → Method |
| Material name mention | Material | Company → processes_material → Material |
| Acquisition/M&A mention | Company (acquirer) | Company → acquired_by → Acquirer |
| Workforce credential mention | Workforce Capability | Company → has_workforce_capability → Credential |

### 7.4 Foreign key relationships to existing tables

| Ontology Table | Links To | Via |
|---------------|---------|-----|
| ontology_entities (type=Company) | prospect_companies | prospect_company_id FK on ontology_entities |
| ontology_relationships (source) | state_research_reports | report_id FK (when report is the source) |
| ontology_entities (source) | state_research_reports | report_id FK |

The `prospect_company_id` foreign key on Company-type ontology entities is the critical bridge — it connects the structured prospect pipeline to the knowledge graph. Every company in the pipeline should have exactly one corresponding Company entity in the ontology. The ontology then adds the technology, certification, process, and relationship layers that the pipeline's flat structure can't capture.

---

## Appendix: Instance Counts Summary

| Entity Type | Instances Extracted | Confidence Distribution |
|------------|-------------------|----------------------|
| Technology / Software | 41 | 41 Confirmed |
| Certification | 21 | 21 Confirmed |
| Equipment Brand | 26 | 26 Confirmed |
| Material | 17 | 17 Confirmed |
| Quality Method | 12 | 12 Confirmed |
| Manufacturing Process | 17 | 17 Confirmed |
| Market Vertical | 12 | 12 Confirmed |
| Ownership Structure | 7 types | 7 Confirmed |
| Workforce Capability | 7 | 7 Confirmed |
| Data Type | 14 | 14 Confirmed/Inferred |
| Readiness Signal | 13 | 13 Confirmed |
| **Company → Technology triples** | **42+** | **All Confirmed** |
| **Company → Certification triples** | **46+** | **All Confirmed** |
| **Company → Company triples** | **36+** | **All Confirmed** |
| **Infrastructure → Product triples** | **28+** | **All Confirmed** |
| **Domain-level triples** | **25+** | **Mixed** |

**Total extracted instances:** ~187 entity instances, ~177+ relationship triples

This is v1 — the starter population. Every discovery call, every research brief, every pilot engagement will add nodes and edges. The structure is designed to scale.

---

*Document generated April 2026 from PSB–Aquila Alliance research reports spanning Erie (42-company), Meadville (34-company), Tier 1 PA/OH/NY expansion, Michigan, Indiana, Illinois, Florida, California, Texas, North Carolina, Minnesota, Georgia, Massachusetts, and New Jersey prospect pipelines, plus the Alliance Industry Infrastructure Profiles.*
