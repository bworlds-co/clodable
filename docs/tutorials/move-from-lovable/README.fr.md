<!-- Généré à partir de guide.json et shared.json. Modifiez ces sources, pas ce fichier. -->

# Passer de Lovable à Clodable

[English](README.md)

Importez votre application Lovable dans Clodable, puis suivez le panneau.

Les captures sont en anglais. Les noms des boutons sont indiqués en français dans le texte.

## 1. Installer Clodable

Dans Claude Desktop, cliquez sur **Plugins**, puis **Ajouter** → **Ajouter une marketplace** → **Ajouter depuis un dépôt**.

Cliquez sur **Sélectionner un dépôt** et collez ce lien :

[https://github.com/bworlds-co/clodable](https://github.com/bworlds-co/clodable)

Validez avec **Utiliser « … »**, puis **Synchroniser**. Cliquez sur **Ajouter** à côté de **Clodable**.

![Ajoutez la marketplace Clodable.](../assets/screenshots/add-marketplace.png)

![Vérifiez l’adresse, puis synchronisez.](../assets/screenshots/marketplace-url.png)

![Clodable est installé.](../assets/screenshots/plugin-added.png)

Quand le bouton affiche **Ajouté**, Clodable est installé. Passez à la suite.

## 2. Récupérer le lien GitHub de votre application

Dans Lovable, ouvrez **Paramètres du projet → Git → GitHub**. Connectez votre application si nécessaire, puis copiez son adresse GitHub.

[Enregistrer votre application Lovable sur GitHub (guide officiel)](https://docs.lovable.dev/integrations/github)

## 3. Créer un dossier pour votre application

Dans Claude, ouvrez l’onglet **Code** (icône **</>**), puis cliquez sur **Nouveau**. Choisissez **Cet ordinateur**, puis le menu des dossiers → **Ouvrir un dossier…**.

Créez un dossier vide avec **Nouveau dossier**, puis sélectionnez-le et cliquez sur **Ouvrir**.

![Ouvrez l’onglet Code, puis une nouvelle conversation.](../assets/screenshots/switch-to-code.png)

## 4. Importer votre application depuis GitHub

Envoyez `/clodable` pour ouvrir le panneau. Cliquez sur **Importer une application depuis GitHub**. Si nécessaire, choisissez **Connecter GitHub** et utilisez le compte qui a accès à votre application.

![Importez votre application existante.](../assets/screenshots/bring-from-github.png)

Collez l’adresse GitHub de votre application, puis cliquez sur **Importer**. Attendez la fin de la configuration.

![Exemple : vulk-corp/hirebright-score. Utilisez l’adresse de votre application.](../assets/screenshots/import-app.png)

## 5. Démarrer la migration guidée

Répondez aux questions de Claude sur votre configuration. Si le panneau propose **Examiner mon application**, commencez par ce bouton. Choisissez ensuite **Quitter Lovable**.

![Ouvrez le parcours de migration.](../assets/screenshots/move-off-lovable.png)

![Le panneau vous guide pour la suite.](../assets/screenshots/look-at-app.png)

Cliquez sur **Examiner mon application**, puis suivez les instructions du panneau, une étape à la fois.

Votre application reste en ligne sur Lovable jusqu’à ce que vous décidiez de basculer.

---

Claude Desktop sur Mac · Captures : 23 novembre 2026 · Clodable 0.4.4

Les captures de migration utilisent une copie isolée de HireBright, configurée selon son environnement Lovable Cloud documenté. Aucun service en ligne n’a été modifié.
