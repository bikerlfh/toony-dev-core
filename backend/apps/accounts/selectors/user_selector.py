from accounts.models import User


def get_user_by_id(user_id):
    return User.objects.filter(id=user_id).first()


def get_user_by_email(email):
    return User.objects.filter(email__iexact=email).first()
