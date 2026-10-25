import OneSignal from 'react-onesignal'

let initialization: Promise<void> | undefined

export function initializeOneSignal(): Promise<void> {
  if (!initialization) {
    initialization = OneSignal.init({
      appId: 'e5380209-ad0e-4b92-a669-7333c176154e',
      notifyButton: {
        enable: true,
        prenotify: false,
        position: 'bottom-right',
        showCredit: true,
        text: {
          'dialog.blocked.message': 'Suivez les instructions de votre navigateur pour activer les notifications.',
          'dialog.blocked.title': 'Notifications bloquées',
          'dialog.main.button.subscribe': "M'abonner",
          'dialog.main.button.unsubscribe': 'Me désabonner',
          'dialog.main.title': 'Notifications',
          'message.action.resubscribed': 'Vous êtes de nouveau abonné aux notifications.',
          'message.action.subscribed': 'Vous êtes abonné aux notifications.',
          'message.action.subscribing': 'Abonnement en cours...',
          'message.action.unsubscribed': 'Vous êtes désabonné des notifications.',
          'message.prenotify': 'Cliquez pour vous abonner aux notifications',
          'tip.state.blocked': 'Les notifications sont bloquées',
          'tip.state.subscribed': 'Vous êtes abonné aux notifications',
          'tip.state.unsubscribed': 'Cliquez pour vous abonner aux notifications',
        },
      },
      serviceWorkerPath: 'OneSignalSDKWorker.js',
    }).catch((error: unknown) => {
      initialization = undefined
      throw error
    })
  }

  return initialization
}

export async function identifyOneSignalUser(userId: string | null): Promise<void> {
  await initializeOneSignal()
  if (userId) {
    await OneSignal.login(userId)
  } else {
    await OneSignal.logout()
  }
}

export async function requestOneSignalPermission(userId: string): Promise<boolean> {
  await identifyOneSignalUser(userId)
  return OneSignal.Notifications.requestPermission()
}
