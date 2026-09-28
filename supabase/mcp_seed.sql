-- ============================================================
-- Human AI — MCP catalog seed (verified 2026-09-28)
-- Every remote URL below answered a real MCP initialize + tools/list
-- probe. Re-runnable (upsert). Sources: official MCP Registry
-- (registry.modelcontextprotocol.io) and mcpservers.org (Blender).
-- ============================================================

insert into public.mcp_servers
  (id, name, description, category, repository, homepage, server_url, transport, auth_type, installation_md, featured, verified_at)
values
  ('tandem-docs', 'Tandem Docs',
   'Remote MCP server for Tandem docs, install guides, SDKs, workflows, and agent setup help.',
   'Developer Tools', 'https://github.com/frumu-ai/tandem', 'https://tandem.ac',
   'https://tandem.ac/mcp', 'remote', 'none', '', true, '2026-09-28T00:00:00Z'),

  ('getlead', 'GetLead',
   'Find B2B leads with verified work emails, verify addresses, and run cold email outreach.',
   'Sales & Marketing', 'https://github.com/Adgrowofficial/getlead-mcp', null,
   'https://mcp.getle.ad/mcp', 'remote', 'none', '', false, '2026-09-28T00:00:00Z'),

  ('agentberg', 'AgentBerg',
   'Agent-to-agent trading intelligence exchange. Publish findings, vote on quality, earn reputation.',
   'Finance', 'https://github.com/Agentberg/agentberg', 'https://agentberg.ai',
   'https://agentberg.ai/mcp', 'remote', 'none', '', true, '2026-09-28T00:00:00Z'),

  ('ufp-fabrication', 'Fabrication Network (UFP)',
   'Turn designs into shipped parts: quote 3D printing, CNC, and decals, then check out.',
   '3D & Making', null, 'https://agenticfabricationnetwork.ai',
   'https://agenticfabricationnetwork.ai/mcp', 'remote', 'none', '', false, '2026-09-28T00:00:00Z'),

  ('agentic-terminal', 'Agentic Terminal Directory',
   'Verified merchants accepting agentic payments — search, verify, pay.',
   'Shopping & Payments', 'https://github.com/observer-protocol/at-directory', null,
   'https://mcp.agenticterminal.ai/mcp', 'remote', 'none', '', false, '2026-09-28T00:00:00Z'),

  ('rx-prices', 'Rx Prices',
   'What pharmacies actually pay for prescriptions (CMS NADAC) plus fair cash-price estimates.',
   'Health & Data', null, null,
   'https://rx.agentlookups.ai/mcp', 'remote', 'none', '', true, '2026-09-28T00:00:00Z'),

  ('groundtruth', 'GroundTruth Environment',
   'Federal environmental records and address due-diligence layers near any US location.',
   'Data & Research', null, null,
   'https://env.agentlookups.ai/mcp', 'remote', 'none', '', false, '2026-09-28T00:00:00Z'),

  ('plumbline', 'Plumbline Contractors',
   'Free public-record contractor license checks across US jurisdictions.',
   'Data & Research', null, null,
   'https://contractors.agentlookups.ai/mcp', 'remote', 'none', '', false, '2026-09-28T00:00:00Z'),

  ('solar-law', 'GreenLight Solar Law',
   'US plug-in solar (balcony solar) law registry with certification watch.',
   'Data & Research', null, null,
   'https://solar.agentlookups.ai/mcp', 'remote', 'none', '', false, '2026-09-28T00:00:00Z'),

  ('hood-names', 'H.O.O.D. Name Service',
   'Resolve .hood names — forward and reverse lookups, text records, availability and pricing.',
   'Web3', null, 'https://www.hood.ag',
   'https://www.hood.ag/api/mcp', 'remote', 'none', '', false, '2026-09-28T00:00:00Z'),

  ('goji', 'Goji SEO Glossary',
   'SEO, web and brand answers from a published glossary, guides and pricing.',
   'Marketing', 'https://github.com/goji-agency/website', 'https://mcp.goji.agency',
   'https://mcp.goji.agency/mcp', 'remote', 'none', '', false, '2026-09-28T00:00:00Z'),

  ('afg', 'AFG Agent Market',
   'Sandbox marketplace where AI agents hire agents for verified outcomes. Test money only.',
   'AI & Agents', null, 'https://afg.ai',
   'https://afg.ai/mcp', 'remote', 'none', '', false, '2026-09-28T00:00:00Z'),

  ('justidea', 'JustIdea Agency',
   'Services, published prices, site search and sales inquiries of an e-commerce agency.',
   'Business', null, 'https://justidea.agency',
   'https://justidea.agency/mcp', 'remote', 'none', '', false, '2026-09-28T00:00:00Z'),

  ('advisors-navigator', 'Advisors Service Navigator',
   'Read-only service discovery, public-page checks, and request-link preparation.',
   'Business', null, 'https://advisorsai.ai',
   'https://advisorsai.ai/mcp', 'remote', 'none', '', false, '2026-09-28T00:00:00Z'),

  ('blender', 'Blender MCP',
   'Official Blender MCP server: natural-language interface to Blender’s Python API — scene analysis, data-block renaming, geometry-nodes docs, debugging. Runs locally inside Blender; cannot run in the cloud.',
   '3D & Design', 'https://projects.blender.org/lab/blender_mcp', 'https://www.blender.org/lab/mcp-server/',
   null, 'local', 'none',
   'Local setup required (verified from mcpservers.org): 1) Install the MCP add-on in Blender (Extensions → Install from Disk, twice: first the Blender Lab repository, then the add-on). 2) Install an LLM client of your choice (e.g. Llama.cpp). 3) Install the MCP server (MCP bundle .mcpb for newer clients, or from source). Because it executes code inside your Blender session, run it in a VM or a machine without sensitive data. Alternatively, expose your local server over a reachable Streamable-HTTP URL and connect it here via “Custom endpoint”.',
   true, '2026-09-28T00:00:00Z')

on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  repository = excluded.repository,
  homepage = excluded.homepage,
  server_url = excluded.server_url,
  transport = excluded.transport,
  auth_type = excluded.auth_type,
  installation_md = excluded.installation_md,
  featured = excluded.featured,
  verified_at = excluded.verified_at;
