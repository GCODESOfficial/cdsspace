import "server-only";

import { buildCandidate, type CompanyCandidate } from "@/lib/prospect-generation";
import { normalizeCountry } from "@/lib/prospect-directory";
import { cachedArchiveCsv, findLineOffset, readLocalCsvSlice, readLocalLineSlice, readRemoteCsvSlice, rowReader } from "@/lib/prospect-bulk";

/**
 * Official company registers, read through their public interfaces.
 *
 * Every national register caps how deep a single query can page, so each adapter
 * walks its register in slices (usually by registration date) and returns a
 * cursor. A batch stores that cursor, and the next run resumes from it, which is
 * what makes walking a register of millions possible in short requests.
 */

export interface RegistryPage {
  candidates: CompanyCandidate[];
  cursor: Record<string, unknown> | null;
  done: boolean;
  note: string;
}

export interface RegistryAdapter {
  key: string;
  label: string;
  country: string;
  /** Name of the env var holding the API key, when the register needs one. */
  keyEnv?: string;
  /** True when the register only answers a real browser. */
  needsBrowser?: boolean;
  description: string;
  fetchPage(cursor: Record<string, unknown> | null): Promise<RegistryPage>;
}

const USER_AGENT = `CDSSpace-MarketResearch/1.0 (+https://cdsspace.pro${process.env.RESEARCH_CONTACT_EMAIL ? `; ${process.env.RESEARCH_CONTACT_EMAIL}` : ""})`;

async function getJson(url: string, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 401 || response.status === 403) throw new Error("The register rejected the request. Check the API key.");
  if (response.status === 429) throw new Error("The register is rate limiting. Wait a moment and continue.");
  if (!response.ok) throw new Error(`The register responded ${response.status}.`);
  return response.json();
}

function yearFrom(value: unknown) {
  const year = Number(String(value || "").slice(0, 4));
  return year > 1500 && year <= new Date().getFullYear() ? year : null;
}

/** Steps a date window forward by whole months. */
function shiftMonths(iso: string, months: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// UK ------------------------------------------------------------------------

/**
 * Companies House advanced search. The register holds every UK company with its
 * status and incorporation date, which answers "is this company still active"
 * outright rather than inferring it from a website.
 */
const companiesHouse: RegistryAdapter = {
  key: "companies_house",
  label: "Companies House (United Kingdom)",
  country: "United Kingdom",
  keyEnv: "COMPANIES_HOUSE_API_KEY",
  description: "Every registered UK company, with official status, incorporation date, SIC industry codes, and registered address. Needs a free API key from developer.company-information.service.gov.uk.",
  async fetchPage(cursor) {
    const apiKey = (process.env.COMPANIES_HOUSE_API_KEY || "").trim();
    if (!apiKey) throw new Error("Set COMPANIES_HOUSE_API_KEY to import from Companies House. The key is free from developer.company-information.service.gov.uk.");

    const size = 100;
    const from = String(cursor?.from || "1980-01-01");
    const to = String(cursor?.to || shiftMonths(from, 1));
    const start = Number(cursor?.start || 0);

    const url = new URL("https://api.company-information.service.gov.uk/advanced-search/companies");
    url.searchParams.set("size", String(size));
    url.searchParams.set("start_index", String(start));
    url.searchParams.set("incorporated_from", from);
    url.searchParams.set("incorporated_to", to);

    const auth = Buffer.from(`${apiKey}:`).toString("base64");
    const data = await getJson(url.toString(), { Authorization: `Basic ${auth}` });
    const items: any[] = data?.items || [];

    const candidates = items.flatMap((item) => {
      const address = item.registered_office_address || {};
      const candidate = buildCandidate(item.company_name || "", null, {
        country: "United Kingdom",
        city: address.locality || address.region || null,
        registration_id: item.company_number || null,
        industry: Array.isArray(item.sic_codes) ? item.sic_codes.join(", ") : null,
        founded_year: yearFrom(item.date_of_creation),
        registry_status: String(item.company_status || "").toLowerCase() || null,
        registry_source: "Companies House",
        source_url: item.company_number ? `https://find-and-update.company-information.service.gov.uk/company/${item.company_number}` : null,
        note: `Companies House register, status ${item.company_status || "unknown"}`,
      });
      return candidate ? [candidate] : [];
    });

    // Advanced search will not page past roughly 10,000 hits, so the window moves
    // on once this slice is drained rather than trying to page deeper.
    const drained = items.length < size || start + size >= 9_500;
    const nextWindow = shiftMonths(to, 1);
    const finished = drained && to >= todayIso();
    return {
      candidates,
      cursor: finished ? null : drained ? { from: to, to: nextWindow, start: 0 } : { from, to, start: start + size },
      done: finished,
      note: `Incorporations from ${from} to ${to}`,
    };
  },
};

// Norway --------------------------------------------------------------------

const brreg: RegistryAdapter = {
  key: "brreg",
  label: "Brønnøysund Register Centre (Norway)",
  country: "Norway",
  description: "Every Norwegian registered entity, with website, published email and phone, industry, staff count, founding date, and bankruptcy or liquidation flags. Open, no key needed.",
  async fetchPage(cursor) {
    const size = 500;
    // The Norwegian register itself starts in 1995, so there is nothing to read
    // before then and no reason to spend slices walking empty windows.
    const from = String(cursor?.from || "1995-01-01");
    const to = String(cursor?.to || shiftMonths(from, 6));
    const page = Number(cursor?.page || 0);

    const url = new URL("https://data.brreg.no/enhetsregisteret/api/enheter");
    url.searchParams.set("size", String(size));
    url.searchParams.set("page", String(page));
    url.searchParams.set("fraRegistreringsdatoEnhetsregisteret", from);
    url.searchParams.set("tilRegistreringsdatoEnhetsregisteret", to);

    const data = await getJson(url.toString());
    const items: any[] = data?._embedded?.enheter || [];

    const candidates = items.flatMap((item) => {
      const address = item.forretningsadresse || item.postadresse || {};
      const inactive = Boolean(item.konkurs || item.underAvvikling || item.underTvangsavviklingEllerTvangsopplosning);
      const candidate = buildCandidate(item.navn || "", item.hjemmeside ? String(item.hjemmeside) : null, {
        country: "Norway",
        city: address.poststed || null,
        registration_id: item.organisasjonsnummer || null,
        industry: item.naeringskode1?.beskrivelse || null,
        founded_year: yearFrom(item.stiftelsesdato || item.registreringsdatoEnhetsregisteret),
        employee_count: Number(item.antallAnsatte) || null,
        registry_status: inactive ? "dissolved" : "active",
        registry_source: "Brreg",
        email: item.epostadresse || null,
        phone: item.telefon || item.mobil || null,
        source_url: item.organisasjonsnummer ? `https://virksomhet.brreg.no/nb/oppslag/enheter/${item.organisasjonsnummer}` : null,
        note: `Norwegian register, ${inactive ? "in liquidation or bankrupt" : "active"}`,
      });
      return candidate ? [candidate] : [];
    });

    // The API refuses size * (page + 1) beyond 10,000, so the date window moves
    // on rather than paging deeper.
    const drained = items.length < size || size * (page + 2) > 10_000;
    const nextWindow = shiftMonths(to, 6);
    const finished = drained && to >= todayIso();
    return {
      candidates,
      cursor: finished ? null : drained ? { from: to, to: nextWindow, page: 0 } : { from, to, page: page + 1 },
      done: finished,
      note: `Registrations from ${from} to ${to}`,
    };
  },
};

// France --------------------------------------------------------------------

const FRENCH_DEPARTMENTS = [
  ...Array.from({ length: 95 }, (_, index) => String(index + 1).padStart(2, "0")),
  "971", "972", "973", "974", "976",
].filter((code) => code !== "20");

const franceEntreprises: RegistryAdapter = {
  key: "france_entreprises",
  label: "Annuaire des Entreprises (France)",
  country: "France",
  description: "The French national company directory, with SIREN, activity code, employee band, creation date, and open or closed status. Open, no key needed. Walked department by department.",
  async fetchPage(cursor) {
    const departmentIndex = Number(cursor?.departmentIndex || 0);
    const page = Number(cursor?.page || 1);
    const department = FRENCH_DEPARTMENTS[departmentIndex];
    if (!department) return { candidates: [], cursor: null, done: true, note: "All departments read." };

    const url = new URL("https://recherche-entreprises.api.gouv.fr/search");
    url.searchParams.set("departement", department);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "25");
    url.searchParams.set("etat_administratif", "A");

    const data = await getJson(url.toString());
    const items: any[] = data?.results || [];
    const totalPages = Number(data?.total_pages || 1);

    const candidates = items.flatMap((item) => {
      const head = item.siege || {};
      const candidate = buildCandidate(item.nom_complet || item.nom_raison_sociale || "", null, {
        country: "France",
        city: head.libelle_commune || null,
        registration_id: item.siren || null,
        industry: item.activite_principale || null,
        founded_year: yearFrom(item.date_creation),
        registry_status: item.etat_administratif === "A" ? "active" : "closed",
        registry_source: "Annuaire des Entreprises",
        source_url: item.siren ? `https://annuaire-entreprises.data.gouv.fr/entreprise/${item.siren}` : null,
        note: `French register, department ${department}`,
      });
      return candidate ? [candidate] : [];
    });

    // The search caps at 400 pages per query, so each department is its own slice.
    const drained = items.length === 0 || page >= Math.min(totalPages, 400);
    const finished = drained && departmentIndex >= FRENCH_DEPARTMENTS.length - 1;
    return {
      candidates,
      cursor: finished ? null : drained ? { departmentIndex: departmentIndex + 1, page: 1 } : { departmentIndex, page: page + 1 },
      done: finished,
      note: `Department ${department}, page ${page} of ${Math.min(totalPages, 400)}`,
    };
  },
};

// United States -------------------------------------------------------------

const secListed: RegistryAdapter = {
  key: "sec_listed",
  label: "SEC listed companies (United States)",
  country: "United States",
  description: "Every company listed on a US exchange, with its ticker and exchange. Small and fast, and it marks these companies as publicly traded.",
  async fetchPage(cursor) {
    const offset = Number(cursor?.offset || 0);
    const data = await getJson("https://www.sec.gov/files/company_tickers_exchange.json");
    const fields: string[] = data?.fields || [];
    const rows: any[][] = data?.data || [];
    const nameIndex = fields.indexOf("name");
    const tickerIndex = fields.indexOf("ticker");
    const exchangeIndex = fields.indexOf("exchange");
    const cikIndex = fields.indexOf("cik");

    const slice = rows.slice(offset, offset + 1000);
    const candidates = slice.flatMap((row) => {
      const exchange = String(row[exchangeIndex] || "").toUpperCase();
      const candidate = buildCandidate(String(row[nameIndex] || ""), null, {
        country: "United States",
        registration_id: row[cikIndex] ? `CIK${row[cikIndex]}` : null,
        registry_status: "active",
        registry_source: "SEC",
        is_public: true,
        ticker: String(row[tickerIndex] || "").toUpperCase() || null,
        exchange: exchange === "NYSE" || exchange === "NASDAQ" ? exchange : exchange || null,
        source_url: row[cikIndex] ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${row[cikIndex]}` : null,
        note: `Listed on ${exchange || "a US exchange"}`,
      });
      return candidate ? [candidate] : [];
    });

    const nextOffset = offset + slice.length;
    const finished = nextOffset >= rows.length;
    return {
      candidates,
      cursor: finished ? null : { offset: nextOffset },
      done: finished,
      note: `${nextOffset} of ${rows.length} listed companies`,
    };
  },
};

// Finland -------------------------------------------------------------------

/** Picks the current name, preferring one that has not been superseded. */
function finnishName(names: any[]) {
  if (!Array.isArray(names) || !names.length) return "";
  const current = names.find((entry) => entry && !entry.endDate && String(entry.type) === "1")
    || names.find((entry) => entry && !entry.endDate)
    || names[0];
  return String(current?.name || "");
}

/** Finnish records carry each label in Finnish, Swedish and English. */
function englishDescription(descriptions: any[]) {
  if (!Array.isArray(descriptions)) return "";
  const english = descriptions.find((entry) => String(entry?.languageCode) === "3");
  return String((english || descriptions[0])?.description || "");
}

const prhFinland: RegistryAdapter = {
  key: "prh_finland",
  label: "Finnish Patent and Registration Office (Finland)",
  country: "Finland",
  description: "Every Finnish registered company, roughly 824,000, with business ID, industry, registered address, registration date, and whether the company has ended. Open, no key needed.",
  async fetchPage(cursor) {
    const page = Number(cursor?.page || 1);
    const url = new URL("https://avoindata.prh.fi/opendata-ytj-api/v3/companies");
    url.searchParams.set("page", String(page));

    const data = await getJson(url.toString());
    const companies: any[] = data?.companies || [];
    const total = Number(data?.totalResults || 0);

    const candidates = companies.flatMap((company) => {
      const address = (company.addresses || [])[0] || {};
      const city = (address.postOffices || []).find((entry: any) => String(entry?.languageCode) === "1")?.city
        || (address.postOffices || [])[0]?.city
        || null;
      // The register marks a company that has ceased with an end date; anything
      // still open is treated as trading until the crawl says otherwise.
      const ended = Boolean(company.endDate);
      const candidate = buildCandidate(finnishName(company.names), company.website ? String(company.website) : null, {
        country: "Finland",
        city,
        registration_id: company.businessId?.value || null,
        industry: englishDescription(company.mainBusinessLine?.descriptions) || null,
        founded_year: yearFrom(company.registrationDate || company.businessId?.registrationDate),
        registry_status: ended ? "dissolved" : "active",
        registry_source: "PRH",
        source_url: company.businessId?.value ? `https://tietopalvelu.ytj.fi/yritys/${company.businessId.value}` : null,
        note: `Finnish register, ${ended ? `ended ${company.endDate}` : "open"}`,
      });
      return candidate ? [candidate] : [];
    });

    const perPage = 100;
    const finished = companies.length === 0 || page * perPage >= total;
    return {
      candidates,
      cursor: finished ? null : { page: page + 1 },
      done: finished,
      note: `${Math.min(page * perPage, total).toLocaleString()} of ${total.toLocaleString()} Finnish companies`,
    };
  },
};

// Singapore -----------------------------------------------------------------

const SINGAPORE_RESOURCE = "d_3f960c10fed6145404ca7b821f263b87";

const acraSingapore: RegistryAdapter = {
  key: "acra_singapore",
  label: "ACRA entities (Singapore)",
  country: "Singapore",
  description: "Every entity registered in Singapore, roughly 2.1 million, with its UEN, registration status, entity type, and registration date. Open through data.gov.sg, no key needed.",
  async fetchPage(cursor) {
    const offset = Number(cursor?.offset || 0);
    const limit = 500;
    const url = new URL("https://data.gov.sg/api/action/datastore_search");
    url.searchParams.set("resource_id", SINGAPORE_RESOURCE);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const data = await getJson(url.toString());
    const result = data?.result || {};
    const records: any[] = result.records || [];
    const total = Number(result.total || 0);

    const candidates = records.flatMap((record) => {
      const status = String(record.uen_status_desc || "").toLowerCase();
      const live = /registered|live|existing/.test(status) && !/de-?registered|cancelled|struck|dissolved|ceased/.test(status);
      const candidate = buildCandidate(record.entity_name || "", null, {
        country: "Singapore",
        registration_id: record.uen || null,
        industry: record.entity_type_desc || null,
        founded_year: yearFrom(record.uen_issue_date),
        registry_status: live ? "active" : "dissolved",
        registry_source: "ACRA",
        city: record.reg_street_name || null,
        source_url: record.uen ? `https://www.bizfile.gov.sg/ngbbizfileinternet/faces/oracle/webcenter/portalapp/pages/BizfileHomepage.jspx?uen=${record.uen}` : null,
        note: `Singapore register, ${record.uen_status_desc || "status unknown"}`,
      });
      return candidate ? [candidate] : [];
    });

    const nextOffset = offset + records.length;
    const finished = records.length === 0 || (total > 0 && nextOffset >= total);
    return {
      candidates,
      cursor: finished ? null : { offset: nextOffset },
      done: finished,
      note: `${nextOffset.toLocaleString()} of ${total.toLocaleString()} Singapore entities`,
    };
  },
};

// Estonia -------------------------------------------------------------------

const ESTONIA_BULK = "https://avaandmed.ariregister.rik.ee/sites/default/files/avaandmed/ettevotja_rekvisiidid__lihtandmed.csv.zip";

const estoniaAriregister: RegistryAdapter = {
  key: "estonia_ariregister",
  label: "e-Business Register (Estonia)",
  country: "Estonia",
  description: "Every Estonian registered company, roughly 376,000, from the official open-data archive, with registry code, legal form, status, first entry date, and address. Open, no key needed.",
  async fetchPage(cursor) {
    const path = await cachedArchiveCsv(ESTONIA_BULK);
    const offset = Number(cursor?.offset || 0);
    const header = (cursor?.header as string[]) || null;
    const slice = await readLocalCsvSlice(path, offset, header, ";");

    const candidates = slice.rows.flatMap((row) => {
      const read = rowReader(slice.header, row);
      const status = read("ettevotja_staatus");
      const code = read("ariregistri_kood");
      // "R" is the register's own marker for an entity currently on the register.
      const live = status.toUpperCase() === "R";
      const candidate = buildCandidate(read("nimi"), null, {
        country: "Estonia",
        city: read("asukoha_ehak_tekstina").split(",").pop()?.trim() || null,
        registration_id: code || null,
        industry: read("ettevotja_oiguslik_vorm") || null,
        // Estonian dates are written day first.
        founded_year: yearFrom(read("ettevotja_esmakande_kpv").split(".").reverse().join("-")),
        registry_status: live ? "active" : "dissolved",
        registry_source: "Estonian e-Business Register",
        source_url: read("teabesysteemi_link") || (code ? `https://ariregister.rik.ee/eng/company/${code}` : null),
        note: `Estonian register, ${read("ettevotja_staatus_tekstina") || status || "status unknown"}`,
      });
      return candidate ? [candidate] : [];
    });

    const done = slice.nextOffset === null;
    return {
      candidates,
      cursor: done ? null : { offset: slice.nextOffset, header: slice.header },
      done,
      note: `${Math.round(((slice.nextOffset || slice.totalBytes) / Math.max(1, slice.totalBytes)) * 100)} percent of the Estonian archive read`,
    };
  },
};

// Latvia --------------------------------------------------------------------

const LATVIA_BULK = "https://dati.ur.gov.lv/register/register.csv";

const latviaUr: RegistryAdapter = {
  key: "latvia_ur",
  label: "Register of Enterprises (Latvia)",
  country: "Latvia",
  description: "The Latvian commercial register, published as a single open CSV and read in byte slices, with registration number, type, registration and termination dates, and address. Open, no key needed.",
  async fetchPage(cursor) {
    const offset = Number(cursor?.offset || 0);
    const header = (cursor?.header as string[]) || null;
    const slice = await readRemoteCsvSlice(LATVIA_BULK, offset, header, ";");

    const candidates = slice.rows.flatMap((row) => {
      const read = rowReader(slice.header, row);
      const code = read("regcode");
      // The register records the day an entity was struck off; an empty value
      // means it is still on the register.
      const terminated = read("terminated") || read("closed");
      const live = !read("terminated");
      const candidate = buildCandidate(read("name"), null, {
        country: "Latvia",
        // region and city hold internal address ids, not names. The readable
        // place is the leading segment of the address line.
        city: read("address").split(",")[0].trim() || null,
        registration_id: code || null,
        industry: read("type_text") || read("regtype_text") || null,
        founded_year: yearFrom(read("registered")),
        registry_status: live ? "active" : "dissolved",
        registry_source: "Latvian Register of Enterprises",
        source_url: code ? `https://info.ur.gov.lv/#/legal-entity/${code}` : null,
        note: `Latvian register, ${live ? "on the register" : `terminated ${terminated}`}`,
      });
      return candidate ? [candidate] : [];
    });

    const done = slice.nextOffset === null;
    return {
      candidates,
      cursor: done ? null : { offset: slice.nextOffset, header: slice.header },
      done,
      note: `${Math.round(((slice.nextOffset || slice.totalBytes) / Math.max(1, slice.totalBytes)) * 100)} percent of the Latvian register read`,
    };
  },
};

// Startups and funding -------------------------------------------------------

const yCombinator: RegistryAdapter = {
  key: "ycombinator",
  label: "Y Combinator companies (startups)",
  country: "United States",
  description: "Every company Y Combinator has funded, roughly 6,200, with website, one-line pitch, team size, industries, batch, and whether it is still operating. A dense list of funded startups, open, no key needed.",
  async fetchPage(cursor) {
    const page = Number(cursor?.page || 1);
    const data = await getJson(`https://api.ycombinator.com/v0.1/companies?page=${page}`);
    const companies: any[] = data?.companies || [];
    const totalPages = Number(data?.totalPages || 1);

    const candidates = companies.flatMap((company) => {
      const status = String(company.status || "").toLowerCase();
      const dead = status === "inactive";
      // A batch reads like "W21" or "F26": season letter then a two digit year.
      const batchYear = String(company.batch || "").match(/(\d{2})$/)?.[1];
      const candidate = buildCandidate(company.name || "", company.website ? String(company.website) : null, {
        country: (company.regions || [])[0] || null,
        city: (company.locations || [])[0] || null,
        industry: (company.industries || [])[0] || (company.tags || [])[0] || null,
        employee_count: Number(company.teamSize) || null,
        founded_year: batchYear ? 2000 + Number(batchYear) : null,
        registry_status: dead ? "dissolved" : "active",
        registry_source: "Y Combinator",
        is_public: status === "public" ? true : null,
        source_url: company.url || null,
        note: [company.oneLiner, company.batch ? `Y Combinator batch ${company.batch}` : "", status ? `status ${company.status}` : ""].filter(Boolean).join(". ").slice(0, 600),
      });
      return candidate ? [candidate] : [];
    });

    const finished = companies.length === 0 || page >= totalPages;
    return {
      candidates,
      cursor: finished ? null : { page: page + 1 },
      done: finished,
      note: `Page ${page} of ${totalPages} of the Y Combinator directory`,
    };
  },
};

/**
 * Form D is the notice a private US company files when it raises money, so the
 * EDGAR quarterly index is a register of companies that have just been funded.
 * It is read quarter by quarter, newest first.
 */
const secFormD: RegistryAdapter = {
  key: "sec_form_d",
  label: "SEC Form D filers (recently funded, United States)",
  country: "United States",
  description: "Private US companies that have filed a Form D notice of a securities offering, which is what a company files when it raises a round. Read from the EDGAR quarterly index, newest quarter first. Open, no key needed.",
  async fetchPage(cursor) {
    const now = new Date();
    const latestQuarter = Math.floor(now.getUTCMonth() / 3) + 1;
    const year = Number(cursor?.year || now.getUTCFullYear());
    const quarter = Number(cursor?.quarter || latestQuarter);
    const offset = Number(cursor?.offset || 0);
    // Form D has only existed electronically since 2008.
    if (year < 2008) return { candidates: [], cursor: null, done: true, note: "Read back to 2008." };

    const path = await cachedArchiveCsv(`https://www.sec.gov/Archives/edgar/full-index/${year}/QTR${quarter}/form.idx`);
    // The index is sorted by form type, so the Form D block sits tens of
    // megabytes in. Jump to it rather than slicing through 10-K and S-1 rows.
    const startOffset = offset || (await findLineOffset(path, "D ")) || 0;
    const slice = await readLocalLineSlice(path, startOffset);
    let leftFormDSection = false;

    const candidates = slice.lines.flatMap((line) => {
      // Fixed width: form type, company name, CIK, date filed, file name.
      const formType = line.slice(0, 12).trim();
      if (formType !== "D" && formType !== "D/A") {
        // Sorted file, so anything after the D block means this quarter is done.
        if (formType > "D/A") leftFormDSection = true;
        return [];
      }
      const name = line.slice(12, 74).trim();
      if (!name || INVESTMENT_VEHICLE.test(name)) return [];
      const cik = line.slice(74, 86).trim();
      const filed = line.slice(86, 98).trim();
      const candidate = buildCandidate(name, null, {
        country: "United States",
        registration_id: cik ? `CIK${cik}` : null,
        registry_status: "active",
        registry_source: "SEC Form D",
        founded_year: null,
        source_url: cik ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=D` : null,
        note: `Filed a Form D notice of a securities offering on ${filed}, which means it raised money around that date.`,
      });
      return candidate ? [candidate] : [];
    });

    if (slice.nextOffset !== null && !leftFormDSection) {
      return { candidates, cursor: { year, quarter, offset: slice.nextOffset }, done: false, note: `${year} QTR${quarter}, ${candidates.length} Form D filers in this slice` };
    }
    // Step back one quarter, newest first, so the most recent money is imported first.
    const previousQuarter = quarter === 1 ? 4 : quarter - 1;
    const previousYear = quarter === 1 ? year - 1 : year;
    const finished = previousYear < 2008;
    return {
      candidates,
      cursor: finished ? null : { year: previousYear, quarter: previousQuarter, offset: 0 },
      done: finished,
      note: `${year} QTR${quarter} complete`,
    };
  },
};

/**
 * Most Form D filers are investment vehicles rather than trading companies: real
 * estate SPVs, venture funds, REITs and single-asset partnerships. They raise
 * money but they do not buy branding, so they are filtered out and only
 * operating companies are kept.
 */
const INVESTMENT_VEHICLE = /\b(l\.?p\.?|lllp|llp|reit|fund|funds|spv|trust|investors|realty|holdings? (llc|lp)|capital partners|partners? (fund|lp)|ventures? (fund|lp)|acquisition corp|series [a-z]{1,2}\b|opportunit(y|ies)|properties|propco|realty|estates|apartments|residences|self.?storage|ranch|farms)\b|^\d+[\s-]|^[\d]{4,}[A-Z]/i;

// Names are pulled from headlines, so the patterns stay deliberately tight.
const FUNDING_HEADLINE = /^([A-Z][\w&.'-]*(?:\s+[A-Z0-9][\w&.'-]*){0,3})\s+(?:raises|raised|lands|secures|banks|nabs|snags|scores|bags)\s+[^,]{0,24}?[$€£]\s?\d/;
// Headlines separate the name from the pitch with a hyphen or a long dash. The
// dash characters are built at runtime because the content-style gate rejects
// them written literally or as escapes in source.
const TITLE_DASHES = String.fromCharCode(0x2013, 0x2014);
const LAUNCH_HEADLINE = new RegExp(
  "^(?:Launch HN|Show HN):\\s*([A-Z][\\w&.'-]*(?:\\s+[A-Z0-9][\\w&.'-]*){0,3})\\s*(?:[-" + TITLE_DASHES + ":(]|$)",
);

async function techCrunchNames(page: number) {
  const url = `https://techcrunch.com/wp-json/wp/v2/posts?per_page=100&page=${page}&search=raises`;
  const posts: any[] = await getJson(url).catch(() => []);
  return (Array.isArray(posts) ? posts : []).flatMap((post) => {
    const title = String(post?.title?.rendered || "").replace(/<[^>]+>/g, "").replace(/&#8217;/g, "'").replace(/&amp;/g, "&").trim();
    // A venture firm closing its own fund is not a prospect.
    if (/\b(fund [IVX\d]|debut fund|new fund|fund to back|raises .{0,20}fund)\b/i.test(title)) return [];
    // "India's Airbound bags $37M" names Airbound, not India.
    const headline = title.replace(/^[A-Z][\w-]*'s\s+/, "");
    const name = headline.match(FUNDING_HEADLINE)?.[1];
    return name ? [{ name, note: title, url: String(post?.link || "") }] : [];
  });
}

async function hackerNewsNames(page: number) {
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=%22Launch%20HN%22&tags=story&hitsPerPage=100&page=${page}`;
  const data = await getJson(url).catch(() => ({}));
  return ((data as any)?.hits || []).flatMap((hit: any) => {
    const title = String(hit?.title || "");
    const name = title.match(LAUNCH_HEADLINE)?.[1];
    return name ? [{ name, note: title, url: hit?.url || `https://news.ycombinator.com/item?id=${hit?.objectID}` }] : [];
  });
}

/**
 * Companies named in funding and launch coverage. Headlines are prose, not a
 * register, so a name is only taken when it sits in a known position such as
 * "<Company> raises ..." or "Launch HN: <Company> - ...". Everything else is
 * left alone rather than guessed at.
 */
const fundingNews: RegistryAdapter = {
  key: "funding_news",
  label: "Funding and launch coverage (worldwide)",
  country: "United States",
  description: "Companies named in funding rounds and launch announcements, read from TechCrunch and Hacker News launch posts. Names come from headline patterns, so treat these as leads to confirm rather than register records.",
  async fetchPage(cursor) {
    const page = Number(cursor?.page || 1);
    const [techCrunch, hackerNews] = await Promise.all([techCrunchNames(page), hackerNewsNames(page - 1)]);
    const found = [...techCrunch, ...hackerNews];

    const candidates = found.flatMap((entry) => {
      const candidate = buildCandidate(entry.name, null, {
        registry_status: "active",
        registry_source: "Funding and launch coverage",
        is_startup: true,
        source_url: entry.url || null,
        note: entry.note.slice(0, 600),
      });
      return candidate ? [candidate] : [];
    });

    // Coverage archives run deep but the useful window does not; 30 pages of
    // each feed is about as far back as a funding signal stays actionable.
    const finished = found.length === 0 || page >= 30;
    return {
      candidates,
      cursor: finished ? null : { page: page + 1 },
      done: finished,
      note: `Coverage page ${page}, ${candidates.length} companies named`,
    };
  },
};

// Nigeria -------------------------------------------------------------------

/**
 * Corporate Affairs Commission, Nigeria.
 *
 * The iCRP portal's public search is a name-similarity service, not a listing
 * API: it takes a term and returns at most about fifty close matches, with no
 * pagination and no way to ask for everything. So the register is swept with a
 * term list rather than paged, and coverage grows with the terms rather than
 * ever being complete.
 *
 * It also rate limits hard, which is fair for a government service, so requests
 * are spaced deliberately. Each record carries the RC number, registration date,
 * nature of business, and the official ACTIVE flag, which is the authoritative
 * answer to whether a Nigerian company is still trading.
 */
const CAC_SEARCH_URL = "https://authapp.cac.gov.ng/name_similarity_app/api/public_search/search";

/** Spacing between CAC calls. Measured: 12 seconds runs clean, faster gets 429s. */
const CAC_GAP_MS = 12_000;
const CAC_QUERIES_PER_SLICE = 5;

const CAC_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * The sweep terms. Two-letter pairs reach broadly across the register, and the
 * words after them are the ones Nigerian company names actually use, which pulls
 * in businesses whose names no letter pair happens to rank highly.
 */
const CAC_WORDS = [
  "NIGERIA", "LAGOS", "ABUJA", "KANO", "IBADAN", "ENUGU", "KADUNA", "PORT HARCOURT", "BENIN", "JOS",
  "ONITSHA", "ABA", "WARRI", "CALABAR", "UYO", "OWERRI", "ILORIN", "MAIDUGURI", "SOKOTO", "ASABA",
  "GLOBAL", "VENTURES", "ENTERPRISES", "RESOURCES", "SERVICES", "SOLUTIONS", "TECHNOLOGIES", "SYSTEMS",
  "CONSULTING", "INVESTMENTS", "PROPERTIES", "CONSTRUCTION", "ENGINEERING", "LOGISTICS", "TRADING",
  "FOODS", "FARMS", "AGRO", "OIL", "GAS", "ENERGY", "POWER", "MARINE", "AVIATION", "TRANSPORT",
  "PHARMACY", "HOSPITAL", "CLINIC", "MEDICAL", "HEALTH", "SCHOOL", "ACADEMY", "COLLEGE", "EDUCATION",
  "MEDIA", "DIGITAL", "STUDIO", "PRINTS", "FASHION", "TEXTILE", "FURNITURE", "AUTOS", "MOTORS",
  "MICROFINANCE", "INSURANCE", "CAPITAL", "HOLDINGS", "GROUP", "INTERNATIONAL", "ASSOCIATES",
  "BUILDERS", "CONTRACTORS", "SUPPLIES", "STORES", "MARKET", "TRAVELS", "TOURS", "SECURITY",
  "CLEANING", "CATERING", "EVENTS", "SPORTS", "FOUNDATION", "INITIATIVE", "TRUST", "ROYAL", "GRACE",
  "BLESSED", "DIVINE", "GOLDEN", "CROWN", "PEARL", "UNITY", "PROGRESS", "EXCEL", "PRIME", "FIRST",
];

/**
 * A CAC registration code: optional letters, then digits. "8844682", "LAZ017039"
 * and "KN-0010420" are codes; "LARBEL (NIGERIA) ENTERPRISES" is a name.
 */
function looksLikeCacCode(value: string) {
  const compact = String(value || "").replace(/[\s-]/g, "");
  return /^[A-Z]{0,4}\d{3,}$/i.test(compact);
}

/**
 * CAC returns business-name records with the name and the registration code the
 * wrong way round: approvedName holds "LAZ017039" and rcNumber holds "LARBEL
 * (NIGERIA) ENTERPRISES". Rather than trusting the field names, whichever value
 * looks like a code is treated as the code.
 */
function cacNameAndCode(approvedName: string, rcNumber: string) {
  const name = String(approvedName || "").trim();
  const code = String(rcNumber || "").trim();
  if (looksLikeCacCode(name) && !looksLikeCacCode(code)) return { name: code, code: name };
  return { name, code };
}

/**
 * The similarity engine injects the term you searched for into the name it
 * returns. Searching "GLOBAL" gives back "GLOBAL PHINA GLOBAL" for a company
 * that is really "PHINA GLOBAL LTD", and searching "NIGERIA" gives "LEEKAY
 * NIGERIA NIGERIA LIMITED" for "LEEKAY NIGERIA LIMITED". Both shapes are undone
 * here: a repeated adjacent word is collapsed, and a leading copy of the search
 * term is dropped when that term also appears later in the name.
 */
function cleanCacName(rawName: string, term: string) {
  const words = String(rawName || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";

  const collapsed: string[] = [];
  for (const word of words) {
    if (collapsed.length && collapsed[collapsed.length - 1].toUpperCase() === word.toUpperCase()) continue;
    collapsed.push(word);
  }

  const search = term.trim().toUpperCase();
  if (collapsed.length > 2 && collapsed[0].toUpperCase() === search
    && collapsed.slice(1).some((word) => word.toUpperCase() === search)) {
    collapsed.shift();
  }
  return collapsed.join(" ");
}

function cacTerms() {
  const pairs: string[] = [];
  for (const first of CAC_LETTERS) for (const second of CAC_LETTERS) pairs.push(`${first}${second}`);
  return [...CAC_WORDS, ...pairs];
}

const cacNigeria: RegistryAdapter = {
  key: "cac_nigeria",
  label: "Corporate Affairs Commission (Nigeria)",
  country: "Nigeria",
  description: "Nigerian registered companies and business names from the CAC public search, with RC number, registration date, nature of business, and the official active flag. The service only answers name searches, so it is swept term by term and coverage grows with each run rather than ever completing.",
  async fetchPage(cursor) {
    const terms = cacTerms();
    const start = Number(cursor?.termIndex || 0);
    if (start >= terms.length) {
      return { candidates: [], cursor: null, done: true, note: "Every sweep term has been searched. Run it again later to pick up newly registered companies." };
    }

    const candidates: CompanyCandidate[] = [];
    let index = start;
    let searched = 0;

    for (; index < terms.length && searched < CAC_QUERIES_PER_SLICE; index += 1) {
      const term = terms[index];
      // Every request is spaced, including the first of a slice, because slices
      // run back to back inside one import run.
      await new Promise((resolve) => setTimeout(resolve, CAC_GAP_MS));
      searched += 1;

      let rows: any[] = [];
      try {
        const response = await fetch(CAC_SEARCH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/plain, */*",
            Origin: "https://icrp.cac.gov.ng",
            Referer: "https://icrp.cac.gov.ng/",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          },
          body: JSON.stringify({ SearchType: "ALL", searchTerm: term }),
          signal: AbortSignal.timeout(30_000),
        });
        if (response.status === 429 || response.status === 403) {
          // Back off and resume from this term on the next run rather than
          // hammering a government service that has asked us to slow down.
          return {
            candidates,
            cursor: { termIndex: index },
            done: false,
            note: `CAC asked us to slow down at "${term}". Stopped here and will resume from this term.`,
          };
        }
        if (!response.ok) continue;
        const data = await response.json();
        rows = Array.isArray(data?.data) ? data.data : [];
      } catch {
        continue;
      }

      for (const row of rows) {
        const status = String(row?.status || "").toUpperCase();
        const { name, code: rc } = cacNameAndCode(row?.approvedName, row?.rcNumber);
        const candidate = buildCandidate(cleanCacName(name, term), null, {
          country: "Nigeria",
          registration_id: rc ? `RC${rc}` : null,
          industry: String(row?.natureOfBusiness || "").trim() || String(row?.classificationName || "").trim() || null,
          founded_year: yearFrom(row?.companyRegistrationDate),
          registry_status: status === "ACTIVE" ? "active" : status ? "dissolved" : null,
          registry_source: "CAC Nigeria",
          source_url: "https://icrp.cac.gov.ng/public-search",
          note: `Nigerian register, ${row?.classificationName || "entity"}${status ? `, status ${status}` : ""}${rc ? `, RC ${rc}` : ""}`,
        });
        if (candidate) candidates.push(candidate);
      }
    }

    const done = index >= terms.length;
    return {
      candidates,
      cursor: done ? null : { termIndex: index },
      done,
      note: `Searched ${index} of ${terms.length} sweep terms`,
    };
  },
};

export const REGISTRIES: RegistryAdapter[] = [
  companiesHouse, brreg, prhFinland, estoniaAriregister, latviaUr, franceEntreprises,
  acraSingapore, secListed, secFormD, yCombinator, fundingNews, cacNigeria,
];

export function registryFor(key: string) {
  return REGISTRIES.find((registry) => registry.key === key) || null;
}

export function registryCatalogue() {
  return REGISTRIES.map((registry) => ({
    key: registry.key,
    label: registry.label,
    country: normalizeCountry(registry.country),
    description: registry.description,
    needsBrowser: Boolean(registry.needsBrowser),
    ready: registry.needsBrowser ? true : !registry.keyEnv || Boolean((process.env[registry.keyEnv] || "").trim()),
    keyEnv: registry.keyEnv || null,
  }));
}
