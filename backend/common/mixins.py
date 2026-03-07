from common.pagination import CursorPaginator


class PaginatedViewMixin:
    """Mixin that adds cursor pagination to raw APIView list endpoints."""

    pagination_class = CursorPaginator

    def paginate(self, queryset, serializer_class, request):
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        ctx = {"request": request}
        if page is not None:
            data = serializer_class(page, many=True, context=ctx).data
            return paginator.get_paginated_response(data)
        data = serializer_class(queryset, many=True, context=ctx).data
        return data
