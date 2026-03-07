import pytest
from rest_framework import status
from tests.factories import SubAgentFactory, SkillFactory, WorkflowNodeFactory, WorkflowEdgeFactory, WorkflowFactory, LabelFactory

pytestmark = pytest.mark.django_db

FAKE_UUID = "00000000-0000-0000-0000-000000000000"


def workflows_url():
    return "/api/workflows/"


def workflow_url(workflow_id):
    return f"/api/workflows/{workflow_id}/"


class TestWorkflowList:
    def test_list_workflows(self, authenticated_client, workflow):
        response = authenticated_client.get(workflows_url())
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_list_workflows_unauthenticated(self, api_client):
        response = api_client.get(workflows_url())
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_workflow(self, authenticated_client):
        data = {"name": "My Workflow", "slug": "my-workflow"}
        response = authenticated_client.post(workflows_url(), data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "My Workflow"
        assert response.data["slug"] == "my-workflow"
        assert response.data["is_active"] is True

    def test_create_workflow_with_org(self, authenticated_client, organization):
        data = {
            "name": "Org Workflow",
            "slug": "org-workflow",
            "organization": str(organization.id),
        }
        response = authenticated_client.post(workflows_url(), data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert str(response.data["organization"]) == str(organization.id)

    def test_create_workflow_with_project(self, authenticated_client, project):
        data = {
            "name": "Project Workflow",
            "slug": "project-workflow",
            "project": str(project.id),
        }
        response = authenticated_client.post(workflows_url(), data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert str(response.data["project"]) == str(project.id)

    def test_create_workflow_missing_name(self, authenticated_client):
        data = {"slug": "no-name"}
        response = authenticated_client.post(workflows_url(), data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestWorkflowDetail:
    def test_get_workflow(self, authenticated_client, workflow):
        response = authenticated_client.get(workflow_url(workflow.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(workflow.id)

    def test_get_workflow_not_found(self, authenticated_client):
        response = authenticated_client.get(workflow_url(FAKE_UUID))
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_workflow(self, authenticated_client, workflow):
        data = {"name": "Updated Name", "is_active": False}
        response = authenticated_client.patch(
            workflow_url(workflow.id), data, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Updated Name"
        assert response.data["is_active"] is False

    def test_delete_workflow(self, authenticated_client, workflow):
        response = authenticated_client.delete(workflow_url(workflow.id))
        assert response.status_code == status.HTTP_204_NO_CONTENT


def nodes_url(workflow_id):
    return f"/api/workflows/{workflow_id}/nodes/"


def node_url(workflow_id, node_id):
    return f"/api/workflows/{workflow_id}/nodes/{node_id}/"


class TestWorkflowNodeList:
    def test_list_nodes(self, authenticated_client, workflow):
        WorkflowNodeFactory(workflow=workflow)
        response = authenticated_client.get(nodes_url(workflow.id))
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_create_subagent_node(self, authenticated_client, workflow, sub_agent):
        data = {
            "node_type": "SUBAGENT",
            "sub_agent": str(sub_agent.id),
            "position_x": 100.0,
            "position_y": 200.0,
        }
        response = authenticated_client.post(nodes_url(workflow.id), data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["node_type"] == "SUBAGENT"
        assert str(response.data["sub_agent"]) == str(sub_agent.id)

    def test_create_skill_node(self, authenticated_client, workflow, skill):
        data = {
            "node_type": "SKILL",
            "skill": str(skill.id),
            "position_x": 300.0,
            "position_y": 400.0,
        }
        response = authenticated_client.post(nodes_url(workflow.id), data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["node_type"] == "SKILL"

    def test_create_node_workflow_not_found(self, authenticated_client, sub_agent):
        data = {"node_type": "SUBAGENT", "sub_agent": str(sub_agent.id)}
        response = authenticated_client.post(nodes_url(FAKE_UUID), data, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestWorkflowNodeDetail:
    def test_update_node_position(self, authenticated_client, workflow):
        node = WorkflowNodeFactory(workflow=workflow)
        data = {"position_x": 500.0, "position_y": 600.0}
        response = authenticated_client.patch(
            node_url(workflow.id, node.id), data, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["position_x"] == 500.0

    def test_delete_node(self, authenticated_client, workflow):
        node = WorkflowNodeFactory(workflow=workflow)
        response = authenticated_client.delete(node_url(workflow.id, node.id))
        assert response.status_code == status.HTTP_204_NO_CONTENT


def edges_url(workflow_id):
    return f"/api/workflows/{workflow_id}/edges/"


def edge_url(workflow_id, edge_id):
    return f"/api/workflows/{workflow_id}/edges/{edge_id}/"


class TestWorkflowEdgeList:
    def test_list_edges(self, authenticated_client, workflow):
        n1 = WorkflowNodeFactory(workflow=workflow, order=0)
        n2 = WorkflowNodeFactory(workflow=workflow, order=1)
        WorkflowEdgeFactory(workflow=workflow, source_node=n1, target_node=n2)
        response = authenticated_client.get(edges_url(workflow.id))
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1

    def test_create_edge(self, authenticated_client, workflow):
        n1 = WorkflowNodeFactory(workflow=workflow, order=0)
        n2 = WorkflowNodeFactory(workflow=workflow, order=1)
        data = {"source_node": str(n1.id), "target_node": str(n2.id)}
        response = authenticated_client.post(edges_url(workflow.id), data, format="json")
        assert response.status_code == status.HTTP_201_CREATED

    def test_create_edge_cycle_rejected(self, authenticated_client, workflow):
        """Creating an edge that forms a cycle should fail."""
        n1 = WorkflowNodeFactory(workflow=workflow, order=0)
        n2 = WorkflowNodeFactory(workflow=workflow, order=1)
        # Create n1 -> n2
        WorkflowEdgeFactory(workflow=workflow, source_node=n1, target_node=n2)
        # Try to create n2 -> n1 (cycle)
        data = {"source_node": str(n2.id), "target_node": str(n1.id)}
        response = authenticated_client.post(edges_url(workflow.id), data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "cycle" in response.data["detail"].lower()

    def test_create_edge_self_loop_rejected(self, authenticated_client, workflow):
        n1 = WorkflowNodeFactory(workflow=workflow, order=0)
        data = {"source_node": str(n1.id), "target_node": str(n1.id)}
        response = authenticated_client.post(edges_url(workflow.id), data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestWorkflowEdgeDetail:
    def test_delete_edge(self, authenticated_client, workflow):
        n1 = WorkflowNodeFactory(workflow=workflow, order=0)
        n2 = WorkflowNodeFactory(workflow=workflow, order=1)
        edge = WorkflowEdgeFactory(workflow=workflow, source_node=n1, target_node=n2)
        response = authenticated_client.delete(edge_url(workflow.id, edge.id))
        assert response.status_code == status.HTTP_204_NO_CONTENT


def resolve_url(issue_id):
    return f"/api/workflows/resolve/{issue_id}/"


class TestWorkflowResolve:
    def test_resolve_global_default(self, authenticated_client, issue, user):
        """Global workflow with no label matches any issue."""
        wf = WorkflowFactory(created_by=user, is_active=True)
        response = authenticated_client.get(resolve_url(issue.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(wf.id)

    def test_resolve_project_over_global(self, authenticated_client, project, issue, user):
        """Project-scoped workflow takes priority over global."""
        WorkflowFactory(created_by=user, is_active=True)  # global
        wf_proj = WorkflowFactory(created_by=user, project=project, is_active=True)
        response = authenticated_client.get(resolve_url(issue.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(wf_proj.id)

    def test_resolve_by_label(self, authenticated_client, issue, user):
        """Label-matched workflow beats default."""
        label = LabelFactory()
        issue.labels.add(label)
        WorkflowFactory(created_by=user, is_active=True)  # default
        wf_label = WorkflowFactory(created_by=user, label=label, is_active=True)
        response = authenticated_client.get(resolve_url(issue.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(wf_label.id)

    def test_resolve_label_fallback_to_default(self, authenticated_client, issue, user):
        """If no label-matched workflow, falls back to default."""
        label = LabelFactory()
        issue.labels.add(label)
        wf_default = WorkflowFactory(created_by=user, is_active=True)
        response = authenticated_client.get(resolve_url(issue.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(wf_default.id)

    def test_resolve_inactive_skipped(self, authenticated_client, issue, user):
        """Inactive workflows are skipped."""
        WorkflowFactory(created_by=user, is_active=False)
        response = authenticated_client.get(resolve_url(issue.id))
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_resolve_no_workflow(self, authenticated_client, issue):
        """No matching workflow returns 404."""
        response = authenticated_client.get(resolve_url(issue.id))
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_resolve_issue_not_found(self, authenticated_client):
        response = authenticated_client.get(resolve_url(FAKE_UUID))
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestWorkflowResolveYAML:
    def test_resolve_returns_yaml_with_format_param(
        self, authenticated_client, project, issue, user
    ):
        """When ?format=yaml, returns YAML string."""
        wf = WorkflowFactory(created_by=user, project=project, is_active=True)
        sa = SubAgentFactory(created_by=user)
        sk = SkillFactory(created_by=user)
        n1 = WorkflowNodeFactory(
            workflow=wf, node_type="SUBAGENT", sub_agent=sa, skill=None, order=0
        )
        n2 = WorkflowNodeFactory(
            workflow=wf, node_type="SKILL", skill=sk, sub_agent=None, order=1
        )
        WorkflowEdgeFactory(workflow=wf, source_node=n1, target_node=n2)

        response = authenticated_client.get(resolve_url(issue.id) + "?format=yaml")
        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "text/yaml"
        import yaml
        data = yaml.safe_load(response.content)
        assert data["name"] == wf.name
        assert len(data["nodes"]) == 2
        node_with_deps = [n for n in data["nodes"] if "depends_on" in n]
        assert len(node_with_deps) == 1
