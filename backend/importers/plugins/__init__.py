from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ExternalProject:
    id: str
    name: str
    description: str = ""
    url: str = ""


@dataclass
class ExternalIssue:
    id: str
    title: str
    description: str = ""
    status: str = ""
    priority: str = ""
    labels: list[str] = field(default_factory=list)
    assignee_email: str = ""
    created_at: str = ""


class ImportPlugin(ABC):
    provider: str

    @abstractmethod
    def authenticate(self, credentials: dict) -> bool:
        ...

    @abstractmethod
    def list_projects(self) -> list[ExternalProject]:
        ...

    @abstractmethod
    def fetch_issues(self, project_id: str) -> list[ExternalIssue]:
        ...
