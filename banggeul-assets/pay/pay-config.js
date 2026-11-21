// banggeul-assets/pay/pay-config.js — 웹 결제 화면 공개 설정. 비밀값(Client Secret 등)을 넣지 않는다.
window.PAY_CONFIG = {
  apiBase: 'https://family-banggeul-293810095616.asia-northeast3.run.app',
  firebaseApiKey: 'AIzaSyA7zsNybHnh_YXDlRVWJcNR-oLB8M9NYu8',
  googleWebClientId: '293810095616-2o26ccn44an8c503ke8erndmmutg1hg0.apps.googleusercontent.com',
  kakaoRestKey: '2ea29a0ef65e99bdcea28e5790a4a226',
  naverClientId: 'claileZGtFjfr61gcoyX',
  redirectUri: 'https://www.krafte.net/banggeul-pay.html',
  origin: 'https://www.krafte.net',
  // 운영 후보와 QA 후보는 같은 설정 파일을 재사용하지 않는다. QA는 별도 비공개 빌드에서
  // environment:'qa'와 QA origin 하나만 넣고, 이 운영 후보의 origin·인증 설정을 복사하지 않는다.
  environment: 'production-candidate',
  allowedWebReturnOrigins: ['https://www.krafte.net'],
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.kraft.banggeul',
  appDeepLink: 'banggeul://',
  // 앱에서 연 웹 handoff가 만료되거나 Toss 취소가 확인되면 native만 받는 상태 신호로 돌아간다.
  // 인증 코드·결제 결과를 싣지 않으며 Android가 이 URI만 수신한다.
  appHandoffReturnUri: 'banggeul://payment-return',
  // 공개 결제 전환은 운영팀의 별도 Go 승인 전까지 금지한다. 서버 설정과 무관하게
  // 고객 웹에서는 결제창·카드 등록을 열지 않고 준비 안내만 보여 준다.
  publicCheckoutEnabled: false,
  // Toss Payments 직접연동 후보. 키·SDK 로드·카드 등록·청구는 별도 Go 전까지 모두 비활성이다.
  tossDirectEnabled: false,
  tossPaymentsClientKey: null,
  // 고객센터 번호는 PayCore.CS_PHONE 하나만 쓴다.
};
