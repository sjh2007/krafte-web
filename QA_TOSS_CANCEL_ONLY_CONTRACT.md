# QA Toss USER_CANCEL 계약

이 문서는 **비공개 QA**에서만 적용한다. production `pay-config.js`는 계속 `publicCheckoutEnabled:false`, `tossDirectEnabled:false`, client key `null`을 유지한다.

## secure env 존재 조건

- `QA_WEB_ORIGIN`: production이 아닌 단일 HTTPS origin. 경로·query·fragment 없이 origin만 허용한다.
- `TOSS_TEST_CLIENT_KEY`: Toss test client key. 값은 CI/호스팅 secure env에서만 런타임 config로 주입하고 저장소·채팅·로그에 기록하지 않는다.
- Android가 발급한 QA 전용 단회 handoff code와 QA customer key는 실행 시점에만 사용하며 저장·보고하지 않는다.

`pay-qa-contract.js`는 위 두 env가 비어 있거나 QA origin이 production origin이면 실패한다. 생성되는 QA config는 `qaCancelOnly:true`이며, 일반 결제 CTA는 `qaPurpose:'user_cancel_evidence'` capability를 만들지 못한다.

## USER_CANCEL 한정 흐름

1. QA harness가 Toss test Billing Auth를 열 때 `qaPurpose:'user_cancel_evidence'`를 명시한다.
2. 성공/실패 반환 URL은 QA origin의 `/banggeul-pay.html`만 사용한다.
3. Toss의 `USER_CANCEL`은 웹에서 `cancelled`로 정규화하고 Android에는 `banggeul://payment-return?status=cancelled`만 보낸다.
4. handoff 만료는 `banggeul://payment-return?status=handoff_expired`만 보낸다.
5. authKey·PG code/message·handoff code·세션·카드 정보·merchant credential은 앱 반환 URI, 고객 메시지, 로그, 보고서에 넣지 않는다.

## 금지와 확인

- QA harness는 성공 반환 뒤 billing-key 교환, 카드 등록, checkout, 청구 API를 호출하지 않는다.
- QA 실행 전후 백엔드팀이 QA 원장의 결제/등록/청구 기록이 변하지 않았는지 대사한다. 웹팀은 원장을 수정하지 않는다.
- Android native 수신은 Android팀이 검증한다. 웹팀은 URI와 고정 메시지 계약만 제공한다.
- production artifact에는 QA config/harness와 secure env 값을 포함하지 않는다.
