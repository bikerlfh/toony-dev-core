import httpx

from importers.plugins import ExternalIssue, ExternalProject, ImportPlugin


class LinearPlugin(ImportPlugin):
    provider = "LINEAR"

    def __init__(self):
        self.api_url = "https://api.linear.app/graphql"
        self.headers = {}

    def authenticate(self, credentials: dict) -> bool:
        api_key = credentials.get("api_key", "")
        if not api_key:
            return False

        self.headers = {
            "Authorization": api_key,
            "Content-Type": "application/json",
        }

        query = '{ "query": "{ viewer { id name } }" }'
        try:
            response = httpx.post(
                self.api_url,
                content=query,
                headers=self.headers,
                timeout=10.0,
            )
            data = response.json()
            return "data" in data and "viewer" in data["data"]
        except (httpx.HTTPError, KeyError, ValueError):
            return False

    def list_projects(self) -> list[ExternalProject]:
        query = """
        {
            "query": "{ teams { nodes { id name description } } }"
        }
        """
        try:
            response = httpx.post(
                self.api_url,
                content=query,
                headers=self.headers,
                timeout=15.0,
            )
            data = response.json()
            teams = data.get("data", {}).get("teams", {}).get("nodes", [])
            return [
                ExternalProject(
                    id=team["id"],
                    name=team["name"],
                    description=team.get("description", ""),
                    url=f"https://linear.app/team/{team['id']}",
                )
                for team in teams
            ]
        except (httpx.HTTPError, KeyError, ValueError):
            return []

    def fetch_issues(self, project_id: str) -> list[ExternalIssue]:
        query_str = """
        query($teamId: String!) {
            issues(filter: { team: { id: { eq: $teamId } } }, first: 250) {
                nodes {
                    id
                    title
                    description
                    priority
                    createdAt
                    state { name }
                    labels { nodes { name } }
                    assignee { email }
                }
            }
        }
        """
        payload = {
            "query": query_str,
            "variables": {"teamId": project_id},
        }
        try:
            response = httpx.post(
                self.api_url,
                json=payload,
                headers=self.headers,
                timeout=30.0,
            )
            data = response.json()
            issues = data.get("data", {}).get("issues", {}).get("nodes", [])

            priority_map = {0: "NONE", 1: "URGENT", 2: "HIGH", 3: "MEDIUM", 4: "LOW"}

            return [
                ExternalIssue(
                    id=issue["id"],
                    title=issue["title"],
                    description=issue.get("description", ""),
                    status=issue.get("state", {}).get("name", ""),
                    priority=priority_map.get(issue.get("priority", 0), "NONE"),
                    labels=[label["name"] for label in issue.get("labels", {}).get("nodes", [])],
                    assignee_email=issue.get("assignee", {}).get("email", "") if issue.get("assignee") else "",
                    created_at=issue.get("createdAt", ""),
                )
                for issue in issues
            ]
        except (httpx.HTTPError, KeyError, ValueError):
            return []
