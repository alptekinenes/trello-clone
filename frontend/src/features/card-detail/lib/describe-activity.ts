import type { ActivityDto } from '@trello/contracts';

/** What the actor did, as the rest of a sentence that starts with their name. Names are plain text. */
export function describeActivity(activity: ActivityDto): string {
  switch (activity.type) {
    case 'CARD_CREATED':
      return `bu kartı ${activity.data.list.title} listesine ekledi`;
    case 'CARD_MOVED':
      return `bu kartı ${activity.data.fromList.title} listesinden ${activity.data.toList.title} listesine taşıdı`;
    case 'CARD_ARCHIVED':
      return 'bu kartı arşivledi';
    case 'CARD_RESTORED':
      return 'bu kartı arşivden geri aldı';
    case 'CARD_COMPLETED':
      return 'bu kartı tamamlandı olarak işaretledi';
    case 'CARD_UNCOMPLETED':
      return 'bu kartı tamamlanmadı olarak işaretledi';
    case 'CARD_MEMBER_ADDED':
      return activity.data.member.id === activity.actor.id
        ? 'bu karta katıldı'
        : `${activity.data.member.name} kişisini bu karta ekledi`;
    case 'CARD_MEMBER_REMOVED':
      return activity.data.member.id === activity.actor.id
        ? 'bu karttan ayrıldı'
        : `${activity.data.member.name} kişisini bu karttan çıkardı`;
    case 'CARD_ATTACHMENT_ADDED':
      return `bu karta ${activity.data.attachment.fileName} dosyasını ekledi`;
    case 'CARD_ATTACHMENT_REMOVED':
      return `bu karttan ${activity.data.attachment.fileName} dosyasını sildi`;
    default:
      return assertUnhandled(activity);
  }
}

/** Compile-time exhaustiveness check; a type this client does not know yet still reads fine. */
function assertUnhandled(_activity: never): string {
  return 'Kartta bir değişiklik yaptı';
}
