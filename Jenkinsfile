pipeline {
  agent any

  tools {
    nodejs 'NodeJS-20' 
  }

  environment {
    IMAGE_NAME = 'nocryptify_frontend'
    NGINX_CONF_DIR   = 'home/ubuntu/secret-notes/nginx'
    
    STAGING_EC2_USER = "${env.STAGING_EC2_USER}"
    STAGING_EC2_HOST = "${env.STAGING_EC2_HOST}"
    STAGING_API_URL  = "${env.STAGING_API_URL}"
    
    DOCKERHUB_CREDENTIALS = credentials('dockerhub')
    SONAR_TOKEN = credentials('sonarqube-token')
    SNYK_TOKEN = credentials('snyk-token')
    DISCORD_WEBHOOK = credentials('discord-webhook-url')
    
    SCANNER_HOME = tool 'SonarScanner'
  }

  stages {
    stage('Debug Info') {
      steps {
        echo "-> Aktueller GIT_BRANCH: ${env.GIT_BRANCH}"
      }
    }
    
    stage('Lint & Sec') {
      when {
        anyOf {
          expression { env.GIT_BRANCH?.contains('main') }
          expression { env.GIT_BRANCH?.contains('deploy/production') }
        }
      }
      steps {
        sh 'npx snyk auth "$SNYK_TOKEN"'
        sh 'npx snyk test --severity-threshold=high || true'
        sh 'npx snyk monitor --project-name="${IMAGE_NAME}" || true'
        
        sh '"$SCANNER_HOME/bin/sonar-scanner" -Dsonar.host.url="$SONAR_HOST_URL" -Dsonar.token="$SONAR_TOKEN" || true'
      }
    }

    stage('Test') {
      when {
        anyOf {
          expression { env.GIT_BRANCH?.contains('main') }
          expression { env.GIT_BRANCH?.contains('deploy/production') }
        }
      }
      steps {
        sh 'npm ci'
        sh 'npm test -- --coverage'
      }
    }

    stage('Build') {
      when {
        anyOf {
          expression { env.GIT_BRANCH?.contains('main') }
          expression { env.GIT_BRANCH?.contains('deploy/production') }
        }
      }
      steps {
        sh "docker build -t ${IMAGE_NAME}:${env.GIT_COMMIT} --build-arg VITE_API_URL=${STAGING_API_URL} ."
      }
    }

    stage('Deliver') {
      when { expression { env.GIT_BRANCH?.contains('deploy/production') } }
      steps {
        sh '''
          echo "$DOCKERHUB_CREDENTIALS_PSW" | docker login -u "$DOCKERHUB_CREDENTIALS_USR" --password-stdin
          docker tag "$IMAGE_NAME:$GIT_COMMIT" "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT"
          docker tag "$IMAGE_NAME:$GIT_COMMIT" "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:latest"
          docker push "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT"
          docker push "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:latest"
        '''
      }
    }

    stage('Deploy to Staging') {
      when { expression { env.GIT_BRANCH?.contains('deploy/production') } }
      steps {
        sshagent(credentials: ['app-ec2-ssh-key']) {
          sh '''
            ssh -o StrictHostKeyChecking=no $STAGING_EC2_USER@$STAGING_EC2_HOST "
              # WICHTIG: Die Backslashes (\\) vor dem $ sorgen dafür, dass 
              # das Skript erst auf dem Server ausgeführt wird!
              
              PROD_CONTAINER=\\$(grep 'upstream frontend_production' $NGINX_CONF_DIR/frontend.map | grep -o 'frontend-[a-z]*')

              if [ \\"\\$PROD_CONTAINER\\" = \\"frontend-blue\\" ]; then
                TARGET_ENV=\\"frontend-green\\"
              else
                TARGET_ENV=\\"frontend-blue\\"
              fi

              echo \\"Production läuft auf \\$PROD_CONTAINER. Deploye neue Version auf \\$TARGET_ENV...\\"

              # 2. Neue Version pullen
              docker login -u $DOCKERHUB_CREDENTIALS_USR -p $DOCKERHUB_CREDENTIALS_PSW
              docker pull $DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT
              
              # 3. Alten Staging-Container abräumen
              docker stop \\$TARGET_ENV || true
              docker rm \\$TARGET_ENV || true
              
              # 4. Neuen Container starten
              docker run -d \\
                --name \\$TARGET_ENV \\
                --network network \\
                $DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT
            "
          '''
        }
      }
    }

    stage('E2E & Switch Traffic') {
      when { expression { env.GIT_BRANCH?.contains('deploy/production') } }
      steps {
        sshagent(credentials: ['app-ec2-ssh-key']) {
          sh '''
            sleep 10
            
            echo "Tests successful! Swapping config on host and reloading NGINX proxy..."

            ssh -o StrictHostKeyChecking=no $STAGING_EC2_USER@$STAGING_EC2_HOST << 'EOF'
              NGINX_CONF_DIR="/home/ubuntu/secret-notes/nginx"
              
              sudo mkdir -p $NGINX_CONF_DIR
              sudo touch $NGINX_CONF_DIR/frontend.map

              PROD_CONTAINER=$(sudo cat $NGINX_CONF_DIR/frontend.map | grep 'upstream frontend_production' | grep -o 'frontend-[a-z]*')

              if [ -z "$PROD_CONTAINER" ]; then
                PROD_CONTAINER="frontend-green"
              fi

              if [ "$PROD_CONTAINER" = "frontend-blue" ]; then
                NEW_PROD="frontend-green"
                NEW_STAGING="frontend-blue"
              else
                NEW_PROD="frontend-blue"
                NEW_STAGING="frontend-green"
              fi

              echo "Umschalten: $NEW_PROD wird Production, $NEW_STAGING wird Staging."
              echo "upstream frontend_production { server $NEW_PROD:80; }" | sudo tee $NGINX_CONF_DIR/frontend.map > /dev/null
              echo "upstream frontend_staging { server $NEW_STAGING:80; }" | sudo tee -a $NGINX_CONF_DIR/frontend.map > /dev/null

              docker exec proxy nginx -s reload
            EOF
          '''
        }
      }
    }

  post {
    failure {
      sh '''
        if [ -n "$DISCORD_WEBHOOK" ]; then
          curl -H "Content-Type: application/json" \
            -X POST \
            -d "{\\"content\\": \\"<@&1522970703245348995> ❌ **${JOB_NAME} #${BUILD_NUMBER}** failed on branch **${BRANCH_NAME}**!\\\\nDetails: ${BUILD_URL}\\"}" \
            "$DISCORD_WEBHOOK"
        fi
      '''
    }
  }
}
