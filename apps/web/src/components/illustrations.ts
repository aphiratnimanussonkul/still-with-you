import errorOffline from '@/assets/illustrations/error-offline.webp';
import familyHome from '@/assets/illustrations/family-home.webp';
import familyMembers from '@/assets/illustrations/family-members.webp';
import familyTree from '@/assets/illustrations/family-tree.webp';
import invitation from '@/assets/illustrations/invitation.webp';
import loginFamilyTree from '@/assets/illustrations/login-family-tree.png';
import loadingPhotos from '@/assets/illustrations/loading-photos.webp';
import loading from '@/assets/illustrations/loading.webp';
import memoryArchived from '@/assets/illustrations/memory-archived.webp';
import memoryStory from '@/assets/illustrations/memory-story.webp';
import newStory from '@/assets/illustrations/new-story.webp';
import onboardingDoor from '@/assets/illustrations/onboarding-door.webp';
import pendingInvite from '@/assets/illustrations/pending-invite.webp';
import personPlaceholder from '@/assets/illustrations/person-placeholder.webp';
import profileSaved from '@/assets/illustrations/profile-saved.webp';
import relationship from '@/assets/illustrations/relationship.webp';
import searchEmpty from '@/assets/illustrations/search-empty.webp';
import success from '@/assets/illustrations/success.webp';
import trashEmpty from '@/assets/illustrations/trash-empty.webp';
import welcome from '@/assets/illustrations/welcome.webp';

export const illustrationSrc = {
  'error-offline': errorOffline,
  'family-home': familyHome,
  'family-members': familyMembers,
  'family-tree': familyTree,
  invitation,
  'login-family-tree': loginFamilyTree,
  'loading-photos': loadingPhotos,
  loading,
  'memory-archived': memoryArchived,
  'memory-story': memoryStory,
  'new-story': newStory,
  'onboarding-door': onboardingDoor,
  'pending-invite': pendingInvite,
  'person-placeholder': personPlaceholder,
  'profile-saved': profileSaved,
  relationship,
  'search-empty': searchEmpty,
  success,
  'trash-empty': trashEmpty,
  welcome,
} as const;

export type IllustrationName = keyof typeof illustrationSrc;

export const ILLUSTRATION_NAMES = Object.keys(illustrationSrc) as IllustrationName[];
