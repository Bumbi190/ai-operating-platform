"""Bind commercial snapshot terms before model use; server owns authorization."""

def bind_commercial_offer(contact, offer):
    if not isinstance(contact, dict) or not isinstance(offer, dict):
        raise ValueError('INVALID_OFFER_CONTRACT')
    # Only an omitted discriminator represents a legacy pilot.
    contact_kind = contact.get('offerKind', 'pilot')
    offer_kind = offer.get('offerKind', 'pilot')
    for kind in (contact_kind, offer_kind):
        if not isinstance(kind, str) or kind not in ('pilot', 'general_service'):
            raise ValueError('INVALID_OFFER_CONTRACT')
    if contact_kind != offer_kind:
        raise ValueError('INVALID_OFFER_CONTRACT')
    pilot_months = contact.get('pilotMonths')
    free_months = offer.get('freeMonths')
    if contact_kind == 'pilot':
        if (type(pilot_months) is not int or type(free_months) is not int
                or pilot_months not in (2, 6, 12) or free_months not in (2, 6, 12)
                or pilot_months != free_months):
            raise ValueError('INVALID_OFFER_CONTRACT')
    elif ('pilotMonths' not in contact or 'freeMonths' not in offer
          or pilot_months is not None or free_months is not None):
        raise ValueError('INVALID_OFFER_CONTRACT')
    # The discriminator and explicit nulls match the persisted contract; never mutate a bound snapshot.
    return ({**contact, 'offerKind': contact_kind}, {**offer, 'offerKind': offer_kind})
