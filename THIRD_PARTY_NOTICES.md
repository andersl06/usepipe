# Avisos de terceiros

## takenet/blip-sdk-csharp — Apache License 2.0

O motor de fluxo do Pipe (`packages/core/src/fluxo/`) é um porte para TypeScript do motor
do Builder da Blip, `src/Take.Blip.Builder/` em
<https://github.com/takenet/blip-sdk-csharp>, distribuído sob a Apache License 2.0.
O repositório original não tem arquivo `NOTICE`; o texto da licença vai no fim deste arquivo.

Cada arquivo portado diz no topo de onde veio e o que mudou. Resumo:

| Arquivo do Pipe | Original em `takenet/blip-sdk-csharp` |
|---|---|
| `packages/core/src/fluxo/gerenciador.ts` | `src/Take.Blip.Builder/FlowManager.cs`, `Hosting/ConventionsConfiguration.cs`, `Constants.cs`, `FlowConstructionException.cs`, `ActionProcessingException.cs`, `OutputProcessingException.cs`, `BuilderException.cs` |
| `packages/core/src/fluxo/modelos.ts` | `src/Take.Blip.Builder/Models/Flow.cs`, `State.cs`, `Input.cs`, `Output.cs`, `Action.cs` |
| `packages/core/src/fluxo/condicao.ts` | `src/Take.Blip.Builder/Models/Condition.cs`, `ConditionComparison.cs`, `ConditionOperator.cs`, `ValueSource.cs`, `ConditionsExtensions.cs`, `StringExtensions.cs` |
| `packages/core/src/fluxo/contexto.ts` | `src/Take.Blip.Builder/ContextBase.cs`, `ContextExtensions.cs`, `StateManager.cs`, `LazyInput.cs`, `Utils/VariableReplacer.cs`, `Variables/VariableSource.cs`, `Variables/InputVariableProvider.cs`, `Variables/StateVariableProvider.cs`, `Variables/ContactVariableProvider.cs` |
| `packages/core/src/fluxo/acoes.ts` | `src/Take.Blip.Builder/Actions/ActionBase.cs`, `ActionProvider.cs`, `SetVariable/*`, `DeleteVariable/*`, `SendMessage/SendMessageAction.cs`, `SendRawMessage/*`, `TrackEvent/TrackEventSettings.cs`, `CreateTicket/CreateTicketAction.cs` |
| `packages/core/src/fluxo/condicao.teste.ts` | `src/Take.Blip.Builder.UnitTests/Models/ConditionComparisonTests.cs`, `ConditionTests.cs` |
| `packages/core/src/fluxo/modelos.teste.ts` | `src/Take.Blip.Builder.UnitTests/Models/FlowTests.cs` |
| `packages/core/src/fluxo/gerenciador.teste.ts` | `src/Take.Blip.Builder.UnitTests/FlowManagerTests.cs`, `OutputConditions/OutputConditionsTests.cs`, `Actions/ActionConditionsTests.cs` |

Não são porte, e não contêm código da Blip:

- `packages/core/src/fluxo/editor.ts` — a conversão do export do editor do Builder para o
  formato publicado. Quem faz isso na Blip é o portal, que é proprietário; o comportamento
  foi reproduzido comparando os dois formatos.
- As ações `ForwardToDesk` e `LeavingFromDesk` em `acoes.ts` — são do servidor da Blip, não
  do SDK; o comportamento veio da forma do bloco de atendimento no export do editor.

---

```text
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "{}"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright {yyyy} {name of copyright owner}

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

## chatwoot/chatwoot — MIT

A entrada do cliente — conectar o WhatsApp pelo cadastro embutido da Meta, importar contatos
por CSV, o nono dígito do Brasil, a flag de cadastro de conta e o roteiro do assistente de
implantação — é porte para TypeScript de arquivos de <https://github.com/chatwoot/chatwoot>,
distribuídos sob a licença MIT. **Nada vem de `enterprise/`**, que tem licença própria. Cada
arquivo portado diz no topo de onde veio e o que o Pipe acrescentou.

| Arquivo do Pipe | Original em `chatwoot/chatwoot` |
|---|---|
| `apps/api/src/dominio/whatsapp/cliente-graph.ts` | `app/services/whatsapp/facebook_api_client.rb` |
| `apps/api/src/dominio/whatsapp/troca-de-token.ts` | `app/services/whatsapp/token_exchange_service.rb` |
| `apps/api/src/dominio/whatsapp/info-do-numero.ts` | `app/services/whatsapp/phone_info_service.rb` |
| `apps/api/src/dominio/whatsapp/criacao-de-canal.ts` | `app/services/whatsapp/channel_creation_service.rb` |
| `apps/api/src/dominio/whatsapp/configuracao-de-webhook.ts` | `app/services/whatsapp/webhook_setup_service.rb`, `setup_webhooks` de `app/models/channel/whatsapp.rb` |
| `apps/api/src/dominio/whatsapp/canal.ts` | `app/models/channel/whatsapp.rb` (`ensure_webhook_verify_token`, `prompt_reauthorization!`, `reauthorized!`, unicidade do número) |
| `apps/api/src/dominio/whatsapp/saude.ts` | `app/services/whatsapp/health_service.rb` (`fetch_health_status`) |
| `apps/api/src/dominio/whatsapp/reautorizacao.ts` | `app/services/whatsapp/reauthorization_service.rb` |
| `apps/api/src/dominio/whatsapp/desmontagem-de-webhook.ts` | `app/services/whatsapp/webhook_teardown_service.rb` |
| `apps/api/src/dominio/whatsapp/cadastro-embutido.ts` | `app/services/whatsapp/embedded_signup_service.rb` |
| `apps/api/src/dominio/whatsapp/validacao-da-configuracao-manual.ts` | `app/services/whatsapp/manual_setup_validation_service.rb` |
| `apps/api/src/dominio/whatsapp/configuracao-manual.ts` | `app/services/whatsapp/manual_setup_service.rb` |
| `apps/api/src/controladores/canais.ts` (`POST /v1/canais/whatsapp`) | `app/controllers/api/v1/accounts/whatsapp/authorizations_controller.rb` |
| `packages/core/src/telefone/index.ts` | `app/services/whatsapp/phone_normalizers/base_phone_normalizer.rb`, `brazil_phone_normalizer.rb`, `phone_number_candidates` de `phone_number_normalization_service.rb` |
| `apps/workers/src/importacao-de-contatos.ts` | `app/jobs/data_import_job.rb` |
| `apps/workers/src/gerenciador-de-contatos.ts` | `app/services/data_import/contact_manager.rb`, validações de `app/models/contact.rb` |
| `apps/api/src/dominio/importacao-de-contatos.ts` | `import` de `app/controllers/api/v1/accounts/contacts_controller.rb`, `app/models/data_import.rb` |
| `apps/api/src/dominio/construtor-de-conta.ts` | `app/builders/account_builder.rb`, `account_signup_enabled?` de `lib/global_config_service.rb` |
| `apps/api/src/controladores/contas.ts` | `create` de `app/controllers/api/v1/accounts_controller.rb` |
| `apps/gestao/src/componentes/cadastro-embutido-whatsapp.tsx` | `app/javascript/dashboard/composables/useWhatsappEmbeddedSignup.js`, `app/javascript/dashboard/routes/dashboard/settings/inbox/channels/whatsapp/utils.js`, `connectWhatsapp` de `.../onboarding/inbox-setup/useChannelConnect.js` |
| `apps/gestao/src/lib/passos-da-implantacao.ts`, `apps/gestao/src/app/implantacao/page.tsx` | os passos e a ordem de `app/javascript/dashboard/routes/dashboard/onboarding/` (`Index.vue`, `InboxSetup.vue`, `inbox-setup/ChannelRow.vue`) — o roteiro; a tela é a da Gestão |
| `apps/api/tests/canais.test.ts`, `apps/api/tests/importacao.test.ts`, `apps/api/tests/contas.test.ts`, `apps/workers/tests/telefone-e-csv.test.ts` | casos de `spec/services/whatsapp/*_spec.rb`, `spec/services/whatsapp/phone_normalizers/brazil_phone_normalizer_spec.rb`, `spec/jobs/data_import_job_spec.rb` |

Não são porte, e não contêm código do Chatwoot:

- `apps/api/src/dominio/whatsapp/estado-de-conexao.ts` — o `state` contra CSRF do cadastro
  embutido. O Chatwoot não tem; o comportamento de `state` por abertura é o da Blip, usada só
  como referência de comportamento.
- `apps/workers/src/csv.ts` — leitor de CSV escrito para reproduzir o comportamento do `CSV` do
  Ruby que o `DataImportJob` usa.
- Os dublês do Graph (`ClienteGraphDuble`) e a leitura dos passos a partir do banco
  (`apps/gestao/src/lib/implantacao.ts`).

---

```text
Copyright (c) 2017-2026 Chatwoot Inc.

Portions of this software are licensed as follows:

* All content that resides under the "enterprise/" directory of this repository, if that directory exists, is licensed under the license defined in "enterprise/LICENSE".
* All third party components incorporated into the Chatwoot Software are licensed under the original license provided by the owner of the applicable component.
* Content outside of the above mentioned directories or restrictions above is available under the "MIT Expat" license as defined below.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
