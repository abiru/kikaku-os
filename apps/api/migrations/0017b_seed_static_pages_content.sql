-- Seed content for core static pages
-- Convert Astro templates to pure HTML for CMS storage

UPDATE static_pages SET body = '
<div class="space-y-16">
  <div class="text-[17px] leading-relaxed text-[#424245]">
    <p>
      この利用規約（以下「本規約」）は、合同会社SBO（以下「当社」）が提供するオンラインストア「Led Kikaku OS Storefront」（以下「本サービス」）の利用条件を定めるものです。本サービスを利用される全ての皆様（以下「利用者」）には、本規約に同意していただく必要があります。
    </p>
  </div>

  <div class="border-t border-gray-100"></div>

  <section>
    <span class="block text-xs font-bold text-[#86868b] tracking-wider mb-2">第1条</span>
    <h2 class="text-xl font-semibold text-[#1d1d1f] mb-4">適用</h2>
    <p class="text-[17px] leading-relaxed text-[#424245]">
      本規約は、利用者と当社との間の本サービスの利用に関わる一切の関係に適用されます。利用者は本サービスを利用することにより、本規約の内容に同意したものとみなされます。
    </p>
  </section>

  <div class="border-t border-gray-100"></div>

  <section>
    <span class="block text-xs font-bold text-[#86868b] tracking-wider mb-2">第2条</span>
    <h2 class="text-xl font-semibold text-[#1d1d1f] mb-4">売買契約と決済</h2>
    <div class="space-y-6 text-[17px] leading-relaxed text-[#424245]">
      <p>
        1. 利用者が当サイト上で注文を行い、当社からの「注文確定メール」が送信された時点で売買契約が成立します。
      </p>
      <p>
        2. <span class="font-semibold text-[#1d1d1f]">決済処理について：</span><br/>
        当サイトにおけるクレジットカード決済は、決済代行会社 Stripe, Inc.（以下「Stripe」）のシステムを利用しています。利用者は、Stripeが定める利用規約およびプライバシーポリシーに従うものとします。なお、決済の不承認や不正利用の疑いがある場合、当社は注文をキャンセルする権利を有します。
      </p>
    </div>
  </section>

  <div class="border-t border-gray-100"></div>

  <section>
    <span class="block text-xs font-bold text-[#86868b] tracking-wider mb-2">第3条</span>
    <h2 class="text-xl font-semibold text-[#1d1d1f] mb-4">禁止事項</h2>
    <p class="text-[17px] leading-relaxed text-[#424245] mb-4">
      利用者は、本サービスの利用にあたり、以下の行為をしてはなりません。
    </p>
    <ul class="list-disc list-outside pl-5 space-y-2 text-[17px] text-[#424245] marker:text-[#86868b]">
      <li>法令または公序良俗に違反する行為</li>
      <li>犯罪行為に関連する行為</li>
      <li>当社のサーバーまたはネットワークの機能を破壊したり、妨害したりする行為（DDoS攻撃、過度なアクセス等）</li>
      <li>当社のサービスの運営を妨害するおそれのある行為</li>
      <li>本サービスのシステムをリバースエンジニアリング、逆コンパイル、または逆アセンブルする行為</li>
      <li>他の利用者になりすます行為</li>
    </ul>
  </section>

  <div class="border-t border-gray-100"></div>

  <section>
    <span class="block text-xs font-bold text-[#86868b] tracking-wider mb-2">第4条</span>
    <h2 class="text-xl font-semibold text-[#1d1d1f] mb-4">免責事項</h2>
    <div class="space-y-6 text-[17px] leading-relaxed text-[#424245]">
      <p>
        1. 当社は、以下のいずれかの事由があると判断した場合、利用者に事前に通知することなく本サービスの全部または一部の提供を停止または中断することができるものとします。
      </p>
      <ul class="list-none pl-4 text-[#6e6e73] space-y-1 text-[15px]">
        <li>・システムの保守点検または更新を行う場合</li>
        <li>・地震、落雷、火災、停電または天災などの不可抗力により、本サービスの提供が困難となった場合</li>
      </ul>
      <p>
        2. 当社は、本サービスの利用に関して、利用者の環境（OS、ブラウザ、通信状況等）に起因する不具合や損害について、一切の責任を負わないものとします。
      </p>
    </div>
  </section>

  <div class="border-t border-gray-100"></div>

  <section>
    <span class="block text-xs font-bold text-[#86868b] tracking-wider mb-2">第5条</span>
    <h2 class="text-xl font-semibold text-[#1d1d1f] mb-4">準拠法・裁判管轄</h2>
    <p class="text-[17px] leading-relaxed text-[#424245]">
      本規約の解釈にあたっては、日本法を準拠法とします。本サービスに関して紛争が生じた場合には、当社の本店所在地を管轄する裁判所を専属的合意管轄とします。
    </p>
  </section>
</div>
', status = 'published', updated_at = datetime('now') WHERE slug = 'terms';

UPDATE static_pages SET body = '
<div class="space-y-16">
  <section>
    <h2 class="text-xl font-semibold text-[#1d1d1f] mb-4">1. 個人情報保護に関する基本方針</h2>
    <p class="text-[17px] leading-relaxed text-[#424245]">
      合同会社SBO（以下「当社」）は、お客様の個人情報を保護することが当社の事業活動の基本であり、社会的責務であると考えています。当社は、個人情報保護法および関連するその他の法令・規範を遵守し、お客様からお預かりした個人情報の適切な利用と保護に努めます。
    </p>
  </section>

  <div class="border-t border-gray-100"></div>

  <section>
    <h2 class="text-xl font-semibold text-[#1d1d1f] mb-4">2. 収集する情報とその取得方法</h2>
    <p class="text-[17px] leading-relaxed text-[#424245] mb-6">
      当社は、本サービス（Led Kikaku OS Storefront）の提供にあたり、以下の情報を適正な手段により取得します。
    </p>
    <ul class="space-y-4 text-[17px] text-[#424245] list-none pl-0">
      <li class="flex gap-4">
        <span class="font-semibold text-[#1d1d1f] shrink-0">お客様から提供される情報</span>
        <span>氏名、配送先住所、電話番号、メールアドレスなど、商品の発送およびご連絡に必要な情報。</span>
      </li>
      <li class="flex gap-4">
        <span class="font-semibold text-[#1d1d1f] shrink-0">自動的に収集される情報</span>
        <span>IPアドレス、ブラウザの種類、アクセス日時、Cookie等のアクセスログ情報。これらはサービスの安全性維持および監査ログとして記録されます。</span>
      </li>
    </ul>
  </section>

  <div class="border-t border-gray-100"></div>

  <section>
    <h2 class="text-xl font-semibold text-[#1d1d1f] mb-4">3. 利用目的</h2>
    <p class="text-[17px] leading-relaxed text-[#424245] mb-4">
      取得した個人情報は、以下の目的のために利用します。
    </p>
    <ul class="list-disc list-outside pl-5 space-y-2 text-[17px] text-[#424245] marker:text-[#86868b]">
      <li>ご注文商品の発送および代金決済のため</li>
      <li>お客様からのお問い合わせやアフターサービス対応のため</li>
      <li>新商品やサービスに関するご案内（メールマガジン等）のため</li>
      <li>システムメンテナンス、不具合対応、および不正利用防止のための監査ログ分析のため</li>
    </ul>
  </section>

  <div class="border-t border-gray-100"></div>

  <section>
    <h2 class="text-xl font-semibold text-[#1d1d1f] mb-4">4. 決済およびデータの管理について</h2>
    <div class="space-y-6 text-[17px] leading-relaxed text-[#424245]">
      <div>
        <h3 class="font-semibold text-[#1d1d1f] mb-2">決済処理 (Stripe)</h3>
        <p>
          クレジットカード決済には、Stripe, Inc. が提供する決済プラットフォームを使用しています。お客様のクレジットカード情報はStripe社によって直接処理・保存され、当社サーバー上では一切保持・通過いたしません。Stripe社のプライバシーポリシーについては、同社のウェブサイトをご確認ください。
        </p>
      </div>
      <div>
        <h3 class="font-semibold text-[#1d1d1f] mb-2">データ保管 (Cloudflare)</h3>
        <p>
          お客様の注文履歴やアカウント情報は、Cloudflare社の提供するデータベース（D1）およびオブジェクトストレージ（R2）を利用し、高度なセキュリティ対策が施された環境下で保管されています。通信は全てSSL/TLSにより暗号化されています。
        </p>
      </div>
    </div>
  </section>

  <div class="border-t border-gray-100"></div>

  <section>
    <h2 class="text-xl font-semibold text-[#1d1d1f] mb-4">5. 第三者への提供</h2>
    <p class="text-[17px] leading-relaxed text-[#424245]">
      当社は、以下の場合を除き、お客様の同意なく個人情報を第三者に提供することはありません。
    </p>
    <ul class="list-disc list-outside pl-5 mt-4 space-y-2 text-[17px] text-[#424245] marker:text-[#86868b]">
      <li>法令に基づく場合</li>
      <li>商品の配送業務を配送業者（ヤマト運輸、佐川急便等）へ委託する場合</li>
      <li>人の生命、身体または財産の保護のために必要があり、本人の同意を得ることが困難な場合</li>
    </ul>
  </section>

  <div class="border-t border-gray-100"></div>

  <section>
    <h2 class="text-xl font-semibold text-[#1d1d1f] mb-4">6. お問い合わせ窓口</h2>
    <p class="text-[17px] leading-relaxed text-[#424245]">
      本ポリシーに関するご質問や、保有個人データの開示・訂正・削除のご請求は、下記までお問い合わせください。
    </p>
    <div class="mt-6 p-6 bg-[#f5f5f7] rounded-2xl text-[15px] text-[#424245]">
      <p class="font-semibold text-[#1d1d1f]">合同会社SBO 個人情報担当</p>
      <p class="mt-1">Email: contact@ledkikaku.com</p>
      <p class="mt-1">（受付時間：平日 10:00 - 18:00）</p>
    </div>
  </section>
</div>
', status = 'published', updated_at = datetime('now') WHERE slug = 'privacy';

UPDATE static_pages SET body = '
<div class="space-y-16">
  <div class="text-[17px] leading-relaxed text-[#424245]">
    <p>
      合同会社SBO（以下「当社」）では、お客様に安心してご利用いただくため、以下の通り返品・返金ポリシーを定めています。商品のご注文前に必ずご一読ください。
    </p>
  </div>

  <div class="border-t border-gray-100"></div>

  <section>
    <span class="block text-xs font-bold text-[#86868b] tracking-wider mb-2">ポリシー 1</span>
    <h2 class="text-xl font-semibold text-[#1d1d1f] mb-4">お客様都合による返品</h2>
    <div class="space-y-4 text-[17px] leading-relaxed text-[#424245]">
      <p>
        <span class="font-semibold text-[#1d1d1f]">未使用・未開封の商品に限り</span>、商品到着後7日以内にお申し出いただければ返品を承ります。
      </p>
      <p>
        ただし、以下の商品は返品をお受けできません。
      </p>
      <ul class="list-disc list-outside pl-5 space-y-2 marker:text-[#86868b]">
        <li>デジタルコンテンツ（ダウンロード商品）</li>
        <li>受注生産品またはカスタマイズされた商品</li>
        <li>開封済みまたは既に使用された商品</li>
      </ul>
      <p class="text-sm text-[#86868b] mt-2">
        ※ お客様都合による返品の場合、返送にかかる送料はお客様負担となります。
      </p>
    </div>
  </section>

  <div class="border-t border-gray-100"></div>

  <section>
    <span class="block text-xs font-bold text-[#86868b] tracking-wider mb-2">ポリシー 2</span>
    <h2 class="text-xl font-semibold text-[#1d1d1f] mb-4">製品不具合・誤配送</h2>
    <p class="text-[17px] leading-relaxed text-[#424245]">
      万が一、お届けした商品に不具合（初期不良）があった場合、または注文と異なる商品が届いた場合は、商品到着後7日以内にご連絡ください。当社の送料負担にて、速やかに交換または返金の手続きを行います。
    </p>
  </section>

  <div class="border-t border-gray-100"></div>

  <section>
    <span class="block text-xs font-bold text-[#86868b] tracking-wider mb-2">ポリシー 3</span>
    <h2 class="text-xl font-semibold text-[#1d1d1f] mb-4">返金方法と手数料</h2>
    <div class="space-y-4 text-[17px] leading-relaxed text-[#424245]">
      <p>
        返金は、ご購入時に利用されたクレジットカード（Stripe決済）に対して行われます。
      </p>
      <ul class="list-disc list-outside pl-5 space-y-2 marker:text-[#86868b]">
        <li>
          <span class="font-semibold text-[#1d1d1f]">処理期間：</span> 当社での返品確認後、通常5〜10営業日以内にStripeを通じて返金処理が実行されます。お客様のカード明細への反映時期は、カード会社により異なります。
        </li>
        <li>
          <span class="font-semibold text-[#1d1d1f]">手数料：</span> 不具合による返金の場合は全額を返金いたします。お客様都合による返金の場合、決済手数料または振込手数料を差し引いた金額となる場合があります。
        </li>
      </ul>
    </div>
  </section>

  <div class="border-t border-gray-100"></div>

  <section>
    <h2 class="text-xl font-semibold text-[#1d1d1f] mb-4">返品・交換のご連絡先</h2>
    <p class="text-[17px] leading-relaxed text-[#424245] mb-6">
      返品や交換をご希望の際は、注文番号を添えて下記までご連絡ください。
    </p>
    <div class="p-6 bg-[#f5f5f7] rounded-2xl text-[15px] text-[#424245]">
      <p class="font-semibold text-[#1d1d1f]">Led Kikaku サポートチーム</p>
      <p class="mt-1">Email: support@ledkikaku.com</p>
    </div>
  </section>
</div>
', status = 'published', updated_at = datetime('now') WHERE slug = 'refund';
