import json

import requests


class ToonyClient:
    def __init__(self, api_url: str, api_key: str):
        self.api_url = api_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {api_key}"
        self.session.headers["Content-Type"] = "application/json"

    def _request(self, method: str, path: str, **kwargs) -> dict | list:
        url = f"{self.api_url}{path}"
        response = self.session.request(method, url, **kwargs)

        if response.status_code == 204:
            return {"ok": True}

        if response.status_code >= 400:
            try:
                detail = response.json()
            except ValueError:
                detail = response.text
            return {"error": f"HTTP {response.status_code}", "detail": detail}

        return response.json()

    def _get(self, path: str, params: dict | None = None) -> dict | list:
        return self._request("GET", path, params=params)

    def _post(self, path: str, data: dict | None = None) -> dict:
        return self._request("POST", path, json=data)

    def _patch(self, path: str, data: dict | None = None) -> dict:
        return self._request("PATCH", path, json=data)

    def _put(self, path: str, data: dict | None = None) -> dict:
        return self._request("PUT", path, json=data)

    def _delete(self, path: str) -> dict:
        return self._request("DELETE", path)

    # -- Auth --
    def get_me(self) -> dict:
        return self._get("/auth/me/")

    # -- Projects --
    def list_projects(self, search: str | None = None) -> dict:
        params = {}
        if search:
            params["q"] = search
        return self._get("/projects/", params=params)

    def get_project(self, project_id: str) -> dict:
        return self._get(f"/projects/{project_id}/")

    def list_project_members(self, project_id: str) -> dict:
        return self._get(f"/projects/{project_id}/members/")

    def list_project_milestones(self, project_id: str) -> dict:
        return self._get(f"/projects/{project_id}/milestones/")

    def list_project_cycles(self, project_id: str) -> dict:
        return self._get(f"/projects/{project_id}/cycles/")

    # -- Issues --
    def list_project_issues(self, project_id: str, **filters) -> dict:
        params = {k: v for k, v in filters.items() if v is not None}
        if "search" in params:
            params["q"] = params.pop("search")
        return self._get(f"/projects/{project_id}/issues/", params=params)

    def list_user_issues(self, **filters) -> dict:
        params = {k: v for k, v in filters.items() if v is not None}
        if "search" in params:
            params["q"] = params.pop("search")
        return self._get("/issues/", params=params)

    def get_issue(self, project_id: str, issue_id: str) -> dict:
        return self._get(f"/projects/{project_id}/issues/{issue_id}/")

    def get_issue_full_detail(self, issue_id: str) -> dict:
        return self._get(f"/issues/{issue_id}/")

    def create_issue(self, project_id: str, data: dict) -> dict:
        return self._post(f"/projects/{project_id}/issues/", data=data)

    def update_issue(self, project_id: str, issue_id: str, data: dict) -> dict:
        return self._put(f"/projects/{project_id}/issues/{issue_id}/", data=data)

    # -- Comments --
    def list_issue_comments(self, project_id: str, issue_id: str) -> dict:
        return self._get(f"/projects/{project_id}/issues/{issue_id}/comments/")

    def create_comment(self, project_id: str, issue_id: str, body: str) -> dict:
        return self._post(
            f"/projects/{project_id}/issues/{issue_id}/comments/",
            data={"body": body},
        )

    # -- Activities --
    def list_issue_activities(self, project_id: str, issue_id: str) -> dict:
        return self._get(f"/projects/{project_id}/issues/{issue_id}/activities/")

    # -- Artifacts --
    def list_issue_artifacts(self, project_id: str, issue_id: str) -> dict:
        return self._get(f"/projects/{project_id}/issues/{issue_id}/artifacts/")

    def create_artifact(self, project_id: str, issue_id: str, data: dict) -> dict:
        return self._post(
            f"/projects/{project_id}/issues/{issue_id}/artifacts/",
            data=data,
        )

    def get_artifact(self, artifact_id: str) -> dict:
        return self._get(f"/artifacts/{artifact_id}/")

    def update_artifact(self, artifact_id: str, data: dict) -> dict:
        return self._patch(f"/artifacts/{artifact_id}/", data=data)

    def delete_artifact(self, artifact_id: str) -> dict:
        return self._delete(f"/artifacts/{artifact_id}/")

    # -- Workspace --
    def list_labels(self, search: str | None = None) -> dict:
        params = {}
        if search:
            params["q"] = search
        return self._get("/workspace/labels/", params=params)

    def search_global(self, organization_id: str, query: str) -> dict:
        return self._get(f"/search/{organization_id}/", params={"q": query})

    # -- Workflows --
    def resolve_issue_workflow_yaml(self, issue_id: str) -> str:
        """Get the resolved workflow YAML for an issue."""
        url = f"{self.api_url}/workflows/resolve/{issue_id}/"
        response = self.session.get(url, params={"format": "yaml"})
        if response.status_code >= 400:
            try:
                detail = response.json()
            except ValueError:
                detail = response.text
            return json.dumps({"error": f"HTTP {response.status_code}", "detail": detail})
        return response.text
