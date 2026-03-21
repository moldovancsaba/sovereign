import { sovereignEnv, sovereignEnvDefault } from "@/lib/env-sovereign";

type GraphQLResponse<T> =
  | { data: T; errors?: undefined }
  | { data?: undefined; errors: Array<{ message: string }> };

function getGithubToken() {
  const token =
    process.env.SOVEREIGN_GITHUB_TOKEN ||
    process.env.SENTINELSQUAD_GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.MVP_PROJECT_TOKEN;
  if (!token) {
    throw new Error(
      "Missing GitHub token. Set SOVEREIGN_GITHUB_TOKEN (or legacy SENTINELSQUAD_GITHUB_TOKEN) or GITHUB_TOKEN."
    );
  }
  return token;
}

async function ghGraphQL<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${getGithubToken()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store"
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub GraphQL HTTP ${res.status}: ${text}`);
  }
  const json = (await res.json()) as GraphQLResponse<T>;
  if ("errors" in json && json.errors?.length) {
    throw new Error(`GitHub GraphQL error: ${json.errors[0]?.message}`);
  }
  if (!("data" in json) || !json.data) {
    throw new Error("GitHub GraphQL returned no data.");
  }
  return json.data;
}

export type ProjectFieldOption = {
  id: string;
  name: string;
  color?: string;
  description?: string;
};
export type ProjectField = {
  id: string;
  name: string;
  options?: ProjectFieldOption[];
};

export type CanonicalAgentRef = {
  key: string;
  displayName?: string | null;
  enabled?: boolean;
  runtime?: string | null;
};

export type BoardAgentResolution = {
  rawValue: string | null;
  normalizedValue: string | null;
  status: "EMPTY" | "MAPPED" | "UNMAPPED";
  mappedAgentKey: string | null;
  mappedAgentDisplayName: string | null;
};

export type BoardAgentReconciliation = {
  optionRows: Array<{
    boardOption: string;
    status: "MAPPED" | "UNMAPPED";
    mappedAgentKey: string | null;
    mappedAgentDisplayName: string | null;
  }>;
  mappedCount: number;
  unmappedCount: number;
  dbOnlyAgents: Array<{ key: string; displayName: string | null }>;
};

function normalizeAgentIdentity(input: string | null | undefined) {
  const value = String(input || "").trim();
  return value ? value.toLowerCase() : "";
}

function pickAgentCaseVariant(
  existing: CanonicalAgentRef | undefined,
  next: CanonicalAgentRef
) {
  if (!existing) return next;
  const existingIsLower = existing.key === existing.key.toLowerCase();
  const nextIsLower = next.key === next.key.toLowerCase();
  if (existingIsLower && !nextIsLower) return next;
  return existing;
}

function buildCanonicalAgentIndex(dbAgents: CanonicalAgentRef[]) {
  const byLower = new Map<string, CanonicalAgentRef>();
  for (const row of dbAgents) {
    const key = String(row.key || "").trim();
    const lower = normalizeAgentIdentity(key);
    if (!lower) continue;
    const normalized = { ...row, key };
    byLower.set(lower, pickAgentCaseVariant(byLower.get(lower), normalized));
  }
  return byLower;
}

export function reconcileBoardAgentValue(params: {
  boardAgentValue: string | null | undefined;
  dbAgents: CanonicalAgentRef[];
}): BoardAgentResolution {
  const rawValue = String(params.boardAgentValue || "").trim();
  if (!rawValue) {
    return {
      rawValue: null,
      normalizedValue: null,
      status: "EMPTY",
      mappedAgentKey: null,
      mappedAgentDisplayName: null
    };
  }

  const byLower = buildCanonicalAgentIndex(params.dbAgents);
  const match = byLower.get(normalizeAgentIdentity(rawValue));
  if (!match) {
    return {
      rawValue,
      normalizedValue: normalizeAgentIdentity(rawValue),
      status: "UNMAPPED",
      mappedAgentKey: null,
      mappedAgentDisplayName: null
    };
  }

  return {
    rawValue,
    normalizedValue: normalizeAgentIdentity(rawValue),
    status: "MAPPED",
    mappedAgentKey: match.key,
    mappedAgentDisplayName: match.displayName ?? null
  };
}

export function reconcileBoardAgentOptions(params: {
  boardAgentOptions: string[];
  dbAgents: CanonicalAgentRef[];
}): BoardAgentReconciliation {
  const byLower = buildCanonicalAgentIndex(params.dbAgents);
  const optionRows: BoardAgentReconciliation["optionRows"] = [];
  const seenMappedKeys = new Set<string>();

  for (const option of params.boardAgentOptions) {
    const boardOption = String(option || "").trim();
    if (!boardOption) continue;
    const match = byLower.get(normalizeAgentIdentity(boardOption));
    if (match) {
      seenMappedKeys.add(normalizeAgentIdentity(match.key));
      optionRows.push({
        boardOption,
        status: "MAPPED",
        mappedAgentKey: match.key,
        mappedAgentDisplayName: match.displayName ?? null
      });
      continue;
    }
    optionRows.push({
      boardOption,
      status: "UNMAPPED",
      mappedAgentKey: null,
      mappedAgentDisplayName: null
    });
  }

  const dbOnlyAgents = params.dbAgents
    .filter((row) => {
      const lower = normalizeAgentIdentity(row.key);
      return lower && !seenMappedKeys.has(lower);
    })
    .map((row) => ({
      key: row.key,
      displayName: row.displayName ?? null
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return {
    optionRows,
    mappedCount: optionRows.filter((r) => r.status === "MAPPED").length,
    unmappedCount: optionRows.filter((r) => r.status === "UNMAPPED").length,
    dbOnlyAgents
  };
}

export async function getProjectMeta() {
  const owner = sovereignEnvDefault("SOVEREIGN_GITHUB_PROJECT_OWNER", "SENTINELSQUAD_GITHUB_PROJECT_OWNER", "moldovancsaba");
  const number = Number(
    sovereignEnv("SOVEREIGN_GITHUB_PROJECT_NUMBER", "SENTINELSQUAD_GITHUB_PROJECT_NUMBER") || "1"
  );

  const data = await ghGraphQL<{
    user: {
      projectV2: {
        id: string;
        title: string;
        fields: {
          nodes: Array<
            | { __typename: "ProjectV2Field"; id: string; name: string }
            | {
                __typename: "ProjectV2SingleSelectField";
                id: string;
                name: string;
                options: ProjectFieldOption[];
              }
          >;
        };
      };
    };
  }>(
    `query($owner:String!, $num:Int!) {
      user(login:$owner) {
        projectV2(number:$num) {
          id
          title
          fields(first:50) {
            nodes {
              __typename
              ... on ProjectV2Field { id name }
              ... on ProjectV2SingleSelectField { id name options { id name color description } }
            }
          }
        }
      }
    }`,
    { owner, num: number }
  );

  const fields: ProjectField[] = data.user.projectV2.fields.nodes.map((n) => {
    if (n.__typename === "ProjectV2SingleSelectField") {
      return { id: n.id, name: n.name, options: n.options };
    }
    return { id: n.id, name: n.name };
  });

  return {
    owner,
    number,
    id: data.user.projectV2.id,
    title: data.user.projectV2.title,
    fields
  };
}

export type ProjectItem = {
  itemId: string;
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;
  repository?: string;
  fields: Record<string, string>;
};

type SingleSelectValueNode = {
  __typename: "ProjectV2ItemFieldSingleSelectValue";
  name: string | null;
  field: { name: string };
};

function isSingleSelectValueNode(n: { __typename: string }): n is SingleSelectValueNode {
  return n.__typename === "ProjectV2ItemFieldSingleSelectValue";
}

export async function listProjectItems(params?: {
  product?: string;
  status?: string;
  agent?: string;
  priority?: string;
  limit?: number;
}) {
  const { id: projectId } = await getProjectMeta();
  const limit = Math.min(Math.max(params?.limit ?? 200, 1), 500);

  const items: ProjectItem[] = [];
  let after: string | null = null;

  while (items.length < limit) {
    type ItemsQuery = {
      node: {
        items: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{
            id: string;
            content:
              | null
              | {
                  __typename: "Issue";
                  number: number;
                  title: string;
                  url: string;
                  repository: { nameWithOwner: string };
                };
            fieldValues: { nodes: Array<SingleSelectValueNode | { __typename: string }> };
          }>;
        };
      };
    };

    const data: ItemsQuery = await ghGraphQL(
      `query($projectId:ID!, $after:String) {
        node(id:$projectId) {
          ... on ProjectV2 {
            items(first:50, after:$after) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                content {
                  __typename
                  ... on Issue {
                    number
                    title
                    url
                    repository { nameWithOwner }
                  }
                }
                fieldValues(first:30) {
                  nodes {
                    __typename
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field { ... on ProjectV2FieldCommon { name } }
                    }
                  }
                }
              }
            }
          }
        }
      }`,
      { projectId, after }
    );

    for (const node of data.node.items.nodes) {
      if (!node.content || node.content.__typename !== "Issue") continue;
      const fields: Record<string, string> = {};
      for (const fv of node.fieldValues.nodes) {
        if (isSingleSelectValueNode(fv)) {
          if (fv.field?.name && fv.name) fields[fv.field.name] = fv.name;
        }
      }
      const item: ProjectItem = {
        itemId: node.id,
        issueNumber: node.content.number,
        issueTitle: node.content.title,
        issueUrl: node.content.url,
        repository: node.content.repository?.nameWithOwner,
        fields
      };

      if (params?.product && fields["Product"] !== params.product) continue;
      if (params?.status && fields["Status"] !== params.status) continue;
      if (params?.agent && fields["Agent"] !== params.agent) continue;
      if (params?.priority && fields["Priority"] !== params.priority) continue;

      items.push(item);
      if (items.length >= limit) break;
    }

    if (!data.node.items.pageInfo.hasNextPage) break;
    after = data.node.items.pageInfo.endCursor;
    if (!after) break;
  }

  return items;
}

export async function ensureProjectItemForIssue(params: {
  issueNumber: number;
}) {
  const { issueNumber } = params;
  const { id: projectId } = await getProjectMeta();
  const repoOwner = sovereignEnvDefault("SOVEREIGN_TASK_REPO_OWNER", "SENTINELSQUAD_TASK_REPO_OWNER", "moldovancsaba");
  const repoName = sovereignEnvDefault("SOVEREIGN_TASK_REPO_NAME", "SENTINELSQUAD_TASK_REPO_NAME", "sovereign");

  const issueData = await ghGraphQL<{
    repository: { issue: { id: string } | null } | null;
  }>(
    `query($owner:String!, $repo:String!, $num:Int!) {
      repository(owner:$owner, name:$repo) {
        issue(number:$num) { id }
      }
    }`,
    { owner: repoOwner, repo: repoName, num: issueNumber }
  );
  const issueId = issueData.repository?.issue?.id;
  if (!issueId) {
    throw new Error(`Issue not found: ${repoOwner}/${repoName}#${issueNumber}`);
  }

  const addData = await ghGraphQL<{
    addProjectV2ItemById: { item: { id: string } };
  }>(
    `mutation($projectId:ID!, $contentId:ID!) {
      addProjectV2ItemById(input:{ projectId:$projectId, contentId:$contentId }) {
        item { id }
      }
    }`,
    { projectId, contentId: issueId }
  );

  return { itemId: addData.addProjectV2ItemById.item.id, projectId };
}

export async function updateSingleSelectField(params: {
  itemId: string;
  fieldName: string;
  optionName: string;
}) {
  const meta = await getProjectMeta();
  const field = meta.fields.find((f) => f.name === params.fieldName);
  if (!field) throw new Error(`Field not found: ${params.fieldName}`);
  const optionId =
    field.options?.find(
      (o) => o.name.toLowerCase() === params.optionName.toLowerCase()
    )?.id ?? null;
  if (!optionId) {
    throw new Error(
      `Option not found for ${params.fieldName}: ${params.optionName}`
    );
  }

  await ghGraphQL<{
    updateProjectV2ItemFieldValue: { projectV2Item: { id: string } };
  }>(
    `mutation($projectId:ID!, $itemId:ID!, $fieldId:ID!, $optionId:String!) {
      updateProjectV2ItemFieldValue(input:{
        projectId:$projectId,
        itemId:$itemId,
        fieldId:$fieldId,
        value:{ singleSelectOptionId:$optionId }
      }) { projectV2Item { id } }
    }`,
    {
      projectId: meta.id,
      itemId: params.itemId,
      fieldId: field.id,
      optionId
    }
  );
}

export async function getItemSingleSelectValues(params: { itemId: string }) {
  const data = await ghGraphQL<{
    node: {
      fieldValues: {
        nodes: Array<
          | SingleSelectValueNode
          | { __typename: string }
        >;
      };
    } | null;
  }>(
    `query($itemId:ID!) {
      node(id:$itemId) {
        ... on ProjectV2Item {
          fieldValues(first:30) {
            nodes {
              __typename
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field { ... on ProjectV2FieldCommon { name } }
              }
            }
          }
        }
      }
    }`,
    { itemId: params.itemId }
  );
  const out: Record<string, string> = {};
  for (const n of data.node?.fieldValues.nodes ?? []) {
    if (isSingleSelectValueNode(n)) {
      if (n.field?.name && n.name) out[n.field.name] = n.name;
    }
  }
  return out;
}

export async function getIssueDetails(params: { issueNumber: number }) {
  const repoOwner = sovereignEnvDefault("SOVEREIGN_TASK_REPO_OWNER", "SENTINELSQUAD_TASK_REPO_OWNER", "moldovancsaba");
  const repoName = sovereignEnvDefault("SOVEREIGN_TASK_REPO_NAME", "SENTINELSQUAD_TASK_REPO_NAME", "sovereign");

  const data = await ghGraphQL<{
    repository: {
      issue: {
        number: number;
        title: string;
        url: string;
        body: string | null;
        createdAt: string;
        updatedAt: string;
      } | null;
    } | null;
  }>(
    `query($owner:String!, $repo:String!, $num:Int!) {
      repository(owner:$owner, name:$repo) {
        issue(number:$num) {
          number
          title
          url
          body
          createdAt
          updatedAt
        }
      }
    }`,
    { owner: repoOwner, repo: repoName, num: params.issueNumber }
  );
  const issue = data.repository?.issue;
  if (!issue) throw new Error(`Issue not found: #${params.issueNumber}`);
  return issue;
}

export async function ensureSingleSelectOption(params: {
  fieldName: string;
  optionName: string;
  color?: "GRAY" | "BLUE" | "GREEN" | "YELLOW" | "ORANGE" | "RED" | "PINK" | "PURPLE";
  description?: string;
}) {
  const fieldName = params.fieldName.trim();
  const optionName = params.optionName.trim();
  if (!fieldName) throw new Error("Missing fieldName.");
  if (!optionName) throw new Error("Missing optionName.");

  const meta = await getProjectMeta();
  const field = meta.fields.find((f) => f.name === fieldName);
  if (!field?.options) {
    throw new Error(`Single-select field not found: ${fieldName}`);
  }

  const existing = field.options.find(
    (o) => o.name.toLowerCase() === optionName.toLowerCase()
  );
  if (existing) {
    return { added: false, optionId: existing.id };
  }

  const singleSelectOptions = field.options.map((o) => ({
    name: o.name,
    color:
      (o.color as
        | "GRAY"
        | "BLUE"
        | "GREEN"
        | "YELLOW"
        | "ORANGE"
        | "RED"
        | "PINK"
        | "PURPLE"
        | undefined) || "GRAY",
    description: o.description || ""
  }));
  singleSelectOptions.push({
    name: optionName,
    color: params.color || "BLUE",
    description: params.description || ""
  });

  const data = await ghGraphQL<{
    updateProjectV2Field: {
      projectV2Field:
        | {
            __typename: "ProjectV2SingleSelectField";
            options: Array<{ id: string; name: string }>;
          }
        | { __typename: string };
    };
  }>(
    `mutation($fieldId:ID!, $name:String!, $singleSelectOptions:[ProjectV2SingleSelectFieldOptionInput!]) {
      updateProjectV2Field(input:{
        fieldId:$fieldId,
        name:$name,
        singleSelectOptions:$singleSelectOptions
      }) {
        projectV2Field {
          __typename
          ... on ProjectV2SingleSelectField {
            options { id name }
          }
        }
      }
    }`,
    {
      fieldId: field.id,
      name: field.name,
      singleSelectOptions
    }
  );

  const updated = data.updateProjectV2Field.projectV2Field;
  if (updated.__typename !== "ProjectV2SingleSelectField" || !("options" in updated)) {
    throw new Error(`Failed to update single-select field: ${fieldName}`);
  }
  const added = updated.options.find(
    (o) => o.name.toLowerCase() === optionName.toLowerCase()
  );
  if (!added?.id) {
    throw new Error(`Option was not created on field ${fieldName}: ${optionName}`);
  }

  return { added: true, optionId: added.id };
}
